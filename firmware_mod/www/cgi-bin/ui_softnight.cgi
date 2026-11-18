#!/bin/sh

echo "Content-type: text/plain"
echo "Pragma: no-cache"
echo "Cache-Control: max-age=0, no-store, no-cache"
echo ""

cat /proc/jz/isp/isp_info
