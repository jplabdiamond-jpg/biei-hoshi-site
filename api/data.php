<?php
/* ============================================================
   星の光の宿 BIEI — CMSデータ ストア (さくら / PHP + JSON)
   ------------------------------------------------------------
   Supabase DB(biei_cms) の代替。key/value を1つのJSONファイルに
   保存・読込する。egress凍結の影響を受けず、復旧を待たずに
   保存も表示もできるようにするための恒久ストア。

   契約:
     GET  /api/data.php
       → {"success":true,"data":{ "<key>":<value>, ... }}   (公開・全キー返却)

     POST /api/data.php   (要トークン)  ※ upsert（既存キーは上書き）
       Header: X-Upload-Token: <共有トークン>
       Body  : {"key":"img_xxx","value":"https://..."}          単一
            or {"entries":{"key1":v1,"key2":v2}}                複数一括
       → {"success":true}
     エラー時: {"success":false,"error":"..."} と HTTP 4xx/5xx

   保存先: ../data/cms-store.json （Web直アクセスは .htaccess で遮断）
   ============================================================ */

header('Content-Type: application/json; charset=utf-8');
$allowOrigin = 'https://hoshi-no-hikari.com';
header('Access-Control-Allow-Origin: ' . $allowOrigin);
header('Access-Control-Allow-Headers: Content-Type, X-Upload-Token');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Vary: Origin');
// 読み取りは常に最新を返す（キャッシュ無効）
header('Cache-Control: no-store, max-age=0');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function respond($code, $payload) {
  http_response_code($code);
  echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  exit;
}

$configPath = __DIR__ . '/upload-config.php';
if (!is_file($configPath)) {
  error_log('[data] config missing');
  respond(500, ['success' => false, 'error' => 'server_not_configured']);
}
require $configPath;

// 保存ファイルパス（config で上書き可能）
$storeFile = defined('DATA_STORE_FILE') ? DATA_STORE_FILE : (__DIR__ . '/../data/cms-store.json');
$storeDir  = dirname($storeFile);

function load_store($file) {
  if (!is_file($file)) return [];
  $raw = @file_get_contents($file);
  if ($raw === false || $raw === '') return [];
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

/* ---------- GET: 全キー返却（公開） ---------- */
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  respond(200, ['success' => true, 'data' => load_store($storeFile)]);
}

/* ---------- POST: upsert（要トークン） ---------- */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  respond(405, ['success' => false, 'error' => 'method_not_allowed']);
}

$token = isset($_SERVER['HTTP_X_UPLOAD_TOKEN']) ? trim($_SERVER['HTTP_X_UPLOAD_TOKEN']) : '';
if ($token === '' || !hash_equals(UPLOAD_TOKEN, $token)) {
  error_log('[data] 401 invalid token from ' . ($_SERVER['REMOTE_ADDR'] ?? '?'));
  respond(401, ['success' => false, 'error' => 'unauthorized']);
}

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) {
  respond(400, ['success' => false, 'error' => 'invalid_json']);
}

// 反映する差分を組み立て
$updates = [];
if (array_key_exists('entries', $body) && is_array($body['entries'])) {
  $updates = $body['entries'];
} elseif (array_key_exists('key', $body)) {
  $k = (string)$body['key'];
  if ($k === '') respond(400, ['success' => false, 'error' => 'empty_key']);
  $updates[$k] = array_key_exists('value', $body) ? $body['value'] : null;
} else {
  respond(400, ['success' => false, 'error' => 'no_key_or_entries']);
}

// 保存先ディレクトリ準備
if (!is_dir($storeDir)) {
  if (!@mkdir($storeDir, 0755, true) && !is_dir($storeDir)) {
    error_log('[data] mkdir failed: ' . $storeDir);
    respond(500, ['success' => false, 'error' => 'mkdir_failed']);
  }
}

// 排他ロックで read-merge-write（同時保存の取りこぼし防止）
$fp = @fopen($storeFile, 'c+');
if ($fp === false) {
  error_log('[data] fopen failed: ' . $storeFile);
  respond(500, ['success' => false, 'error' => 'open_failed']);
}
if (!flock($fp, LOCK_EX)) {
  fclose($fp);
  respond(500, ['success' => false, 'error' => 'lock_failed']);
}
$cur = stream_get_contents($fp);
$store = $cur ? json_decode($cur, true) : [];
if (!is_array($store)) $store = [];

foreach ($updates as $k => $v) {
  if ($v === null) { unset($store[$k]); }   // null は削除
  else { $store[$k] = $v; }
}

$json = json_encode($store, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
if ($json === false) {
  flock($fp, LOCK_UN); fclose($fp);
  respond(500, ['success' => false, 'error' => 'encode_failed']);
}
ftruncate($fp, 0);
rewind($fp);
$w = fwrite($fp, $json);
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

if ($w === false) {
  error_log('[data] write failed: ' . $storeFile);
  respond(500, ['success' => false, 'error' => 'write_failed']);
}
error_log('[data] ok upsert ' . count($updates) . ' key(s), store=' . count($store));
respond(200, ['success' => true, 'count' => count($updates)]);
