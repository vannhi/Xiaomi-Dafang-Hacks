#!/bin/sh

# CGI file to view and edit the files of the configuration folder
#
#   GET  ?cmd=list                 ls -l of the editable files (and of their .bak copies)
#   GET  ?cmd=read&file=<path>     content of a file
#   POST ?cmd=write&file=<path>    replace a file by the raw request body (text/plain)
#   POST ?cmd=restore&file=<path>  swap a file and its .bak copy (undo the last save)
#
# <path> is relative to the configuration folder. The body of a write is never
# decoded nor evaluated: it is written as is.

CONFIG=/system/sdcard/config
MAX_SIZE=65536
BUSYBOX=/system/sdcard/bin/busybox

# Parse the query string only: the body of a write is the file content
_METHOD=${REQUEST_METHOD}
REQUEST_METHOD=GET
. /system/sdcard/www/cgi-bin/func.cgi
REQUEST_METHOD=${_METHOD}

reply() {
  echo "Status: $1"
  echo "Content-type: text/plain"
  echo "Cache-Control: max-age=0, no-store, no-cache"
  echo ""
  echo "$2"
  exit 0
}

# Run a step of a save, answer its error output if it fails
# (the temporary file named in $cleanup is removed first)
step() {
  what=$1
  shift
  out=$("$@" 2>&1) && return 0
  status=$?
  [ -n "$cleanup" ] && rm -f "$cleanup"
  reply "500 Internal Server Error" "$what failed: ${out:-exit code $status}"
}

# Copy keeping the permissions (executable scripts); the SD card may not support
# them all, so fall back to a plain copy
copy() {
  cp -p "$1" "$2" 2>/dev/null || cp "$1" "$2"
}

# Flush the SD card cache: not critical, never fails the request
flush() {
  "$BUSYBOX" sync 2>/dev/null
}

# Private keys and certificates are never shown
hidden() {
  case "$1" in
    ssl/*|*.pem|*.pem.*|*.key|*.key.*) return 0 ;;
  esac
  return 1
}

# Check the requested file and set $file (relative) and $path (absolute)
check_file() {
  file=$(printf '%b' "${F_file//%/\\x}")
  case "$file" in
    ""|/*|*..*|*//*|*[!A-Za-z0-9._/-]*) reply "400 Bad Request" "Invalid file name" ;;
  esac
  hidden "$file" && reply "403 Forbidden" "This file can't be viewed from the web interface"
  path="$CONFIG/$file"
  [ -f "$path" ] || reply "404 Not Found" "No such file: $file"
}

check_writable() {
  case "$file" in
    *.bak|*.tmp) reply "400 Bad Request" "Backup files can't be modified" ;;
  esac
  [ "$_METHOD" = "POST" ] || reply "405 Method Not Allowed" "Use POST"
}

case "$F_cmd" in
  list)
    echo "Content-type: text/plain"
    echo "Cache-Control: max-age=0, no-store, no-cache"
    echo ""
    cd "$CONFIG" && find . -type f ! -name '*.tmp' ! -name '*.pem' ! -name '*.key' ! -path './ssl/*' | xargs -r ls -l
    ;;

  read)
    check_file
    echo "Content-type: text/plain; charset=utf-8"
    echo "Cache-Control: max-age=0, no-store, no-cache"
    echo ""
    cat "$path"
    ;;

  write)
    check_file
    check_writable
    size=${CONTENT_LENGTH:-0}
    case "$size" in
      ""|*[!0-9]*) reply "411 Length Required" "Missing content length" ;;
    esac
    [ "$size" -le "$MAX_SIZE" ] || reply "413 Payload Too Large" "File too large (limit: $MAX_SIZE bytes)"
    # The temporary copy keeps the permissions of the file (executable scripts)
    out=$(copy "$path" "$path.tmp" 2>&1)       || reply "500 Internal Server Error" "Unable to write in $CONFIG (read-only SD card?): $out"
    cleanup="$path.tmp"
    head -c "$size" > "$path.tmp"
    # Unquoted: busybox wc pads the count with spaces
    if [ $(wc -c < "$path.tmp") -ne "$size" ]; then
      rm -f "$path.tmp"
      reply "500 Internal Server Error" "Incomplete upload, $file is unchanged"
    fi
    step "Backup of $file" copy "$path" "$path.bak"
    step "Replacing $file" mv -f "$path.tmp" "$path"
    flush
    reply "200 OK" "Saved $file (previous version kept in $file.bak)"
    ;;

  restore)
    check_file
    check_writable
    [ -f "$path.bak" ] || reply "404 Not Found" "No backup of $file"
    step "Restoring $file" mv -f "$path" "$path.tmp"
    if ! out=$(mv -f "$path.bak" "$path" 2>&1); then
      # Put the current version back
      mv -f "$path.tmp" "$path"
      reply "500 Internal Server Error" "Restoring $file failed: $out"
    fi
    step "Keeping the replaced version as $file.bak" mv -f "$path.tmp" "$path.bak"
    flush
    reply "200 OK" "Restored the previous version of $file (the replaced version is now $file.bak)"
    ;;

  *)
    reply "400 Bad Request" "Unsupported command '$F_cmd'"
    ;;
esac

exit 0
