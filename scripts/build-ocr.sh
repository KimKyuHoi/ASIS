#!/usr/bin/env bash
set -euo pipefail

# ASIS OCR 헬퍼(Swift + Vision) 유니버설 바이너리 빌드.
# 사용자 머신에 Xcode/swiftc 가 없어도 되도록 빌드 시 컴파일해 앱 번들에 포함한다
# (ffmpeg-static 과 같은 결). Vision 은 macOS 시스템 프레임워크라 런타임 의존성 없음.

SRC="resources/ocr/asis-ocr.swift"
OUT_DIR="resources/bin"
OUT="$OUT_DIR/asis-ocr"
MIN=13.0  # package.json build.mac.minimumSystemVersion 과 일치

mkdir -p "$OUT_DIR"

swiftc -O -target "arm64-apple-macos$MIN" -o "$OUT_DIR/asis-ocr-arm64" \
  "$SRC" -framework Vision -framework AppKit
swiftc -O -target "x86_64-apple-macos$MIN" -o "$OUT_DIR/asis-ocr-x64" \
  "$SRC" -framework Vision -framework AppKit

lipo -create -output "$OUT" "$OUT_DIR/asis-ocr-arm64" "$OUT_DIR/asis-ocr-x64"
rm -f "$OUT_DIR/asis-ocr-arm64" "$OUT_DIR/asis-ocr-x64"

echo "built: $OUT"
lipo -info "$OUT"
