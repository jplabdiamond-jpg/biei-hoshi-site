<?php
/* ============================================================
   画像アップローダ設定（サンプル）
   ------------------------------------------------------------
   使い方:
     1. このファイルを upload-config.php にコピー
     2. UPLOAD_TOKEN を推測されにくいランダム文字列に変更
     3. 同じ値を管理画面 admin/dashboard.html の UPLOAD_TOKEN にも設定
   ※ upload-config.php は git にコミットしないこと（.gitignore 済み）
   ============================================================ */

// 管理画面と共有する秘密トークン（必ず変更すること）
define('UPLOAD_TOKEN', 'CHANGE_ME_TO_A_LONG_RANDOM_STRING');

// 保存先ディレクトリ（ドキュメントルートからの相対）
define('UPLOAD_DIR', __DIR__ . '/../images/cms');

// 公開URLのベース（末尾スラッシュなし）
define('UPLOAD_PUBLIC_BASE', 'https://hoshi-no-hikari.com/images/cms');

// 許可する最大ファイルサイズ（バイト）: 8MB
define('UPLOAD_MAX_BYTES', 8 * 1024 * 1024);
