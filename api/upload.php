<?php
/* ============================================================
   星の光の宿 BIEI — 画像アップローダ (さくら / PHP)
   ------------------------------------------------------------
   管理画面から画像を受け取り /images/cms/ に保存し公開URLを返す。
   Supabase Storage の egress 依存を解消するための恒久対策。

   契約:
     POST /api/upload.php
     Header : X-Upload-Token: <共有トークン>
     Body   : multipart/form-data  file=<画像> , name=<フィールド名(任意)>
              または application/json { "dataUrl":"data:image/...", "name":"..." }
     Return : {"success":true,"url":"https://.../images/cms/xxx.jpg"}
              {"success":false,"error":"..."}   (HTTP 4xx/5xx)
   ============================================================ */

header('Content-Type: application/json; charset=utf-8');
// 同一オリジン運用だがサブドメイン差異に備えCORSを明示（本番ドメインのみ許可）
$allowOrigin = 'https://hoshi-no-hikari.com';
header('Access-Control-Allow-Origin: ' . $allowOrigin);
header('Access-Control-Allow-Headers: Content-Type, X-Upload-Token');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Vary: Origin');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function respond($code, $payload) {
  http_response_code($code);
  echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  exit;
}

$configPath = __DIR__ . '/upload-config.php';
if (!is_file($configPath)) {
  error_log('[upload] config missing');
  respond(500, ['success' => false, 'error' => 'server_not_configured']);
}
require $configPath;

/* ---- メソッド ---- */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  respond(405, ['success' => false, 'error' => 'method_not_allowed']);
}

/* ---- 認証（共有トークン） ---- */
$token = isset($_SERVER['HTTP_X_UPLOAD_TOKEN']) ? trim($_SERVER['HTTP_X_UPLOAD_TOKEN']) : '';
if ($token === '' || !hash_equals(UPLOAD_TOKEN, $token)) {
  error_log('[upload] 401 invalid token from ' . ($_SERVER['REMOTE_ADDR'] ?? '?'));
  respond(401, ['success' => false, 'error' => 'unauthorized']);
}

/* ---- 入力取得（multipart or JSON dataURL の両対応） ---- */
$binary = null;
$origName = 'img';

if (!empty($_FILES['file']['tmp_name'])) {
  if ($_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    respond(400, ['success' => false, 'error' => 'upload_error_' . $_FILES['file']['error']]);
  }
  if ($_FILES['file']['size'] > UPLOAD_MAX_BYTES) {
    respond(413, ['success' => false, 'error' => 'file_too_large']);
  }
  $binary = file_get_contents($_FILES['file']['tmp_name']);
  if (!empty($_POST['name'])) $origName = $_POST['name'];
} else {
  $raw = file_get_contents('php://input');
  $json = json_decode($raw, true);
  if (is_array($json) && !empty($json['dataUrl']) && strpos($json['dataUrl'], 'data:') === 0) {
    $comma = strpos($json['dataUrl'], ',');
    $b64 = substr($json['dataUrl'], $comma + 1);
    $binary = base64_decode($b64, true);
    if ($binary === false) respond(400, ['success' => false, 'error' => 'invalid_base64']);
    if (strlen($binary) > UPLOAD_MAX_BYTES) respond(413, ['success' => false, 'error' => 'file_too_large']);
    if (!empty($json['name'])) $origName = $json['name'];
  }
}

if ($binary === null || strlen($binary) === 0) {
  respond(400, ['success' => false, 'error' => 'no_file']);
}

/* ---- MIME 検証（拡張子ではなく実体で判定） ---- */
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime  = $finfo->buffer($binary);
$allowed = [
  'image/jpeg' => 'jpg',
  'image/png'  => 'png',
  'image/webp' => 'webp',
  'image/gif'  => 'gif',
];
if (!isset($allowed[$mime])) {
  respond(415, ['success' => false, 'error' => 'unsupported_type', 'detected' => $mime]);
}
$ext = $allowed[$mime];

/* ---- 保存先の準備 ---- */
if (!is_dir(UPLOAD_DIR)) {
  if (!@mkdir(UPLOAD_DIR, 0755, true) && !is_dir(UPLOAD_DIR)) {
    error_log('[upload] mkdir failed: ' . UPLOAD_DIR);
    respond(500, ['success' => false, 'error' => 'mkdir_failed']);
  }
}

/* ---- ファイル名のサニタイズ（英数と _ - のみ） ---- */
$safe = preg_replace('/[^A-Za-z0-9_\-]/', '', (string)$origName);
if ($safe === '') $safe = 'img';
$safe = substr($safe, 0, 60);
$fname = $safe . '_' . time() . '_' . bin2hex(random_bytes(3)) . '.' . $ext;
$dest = rtrim(UPLOAD_DIR, '/') . '/' . $fname;

if (file_put_contents($dest, $binary) === false) {
  error_log('[upload] write failed: ' . $dest);
  respond(500, ['success' => false, 'error' => 'write_failed']);
}
@chmod($dest, 0644);

$url = rtrim(UPLOAD_PUBLIC_BASE, '/') . '/' . $fname;
error_log('[upload] ok ' . $url . ' (' . strlen($binary) . ' bytes)');
respond(200, ['success' => true, 'url' => $url]);
