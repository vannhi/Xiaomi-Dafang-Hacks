#!/bin/sh

echo "Content-type: text/plain"
echo "Pragma: no-cache"
echo "Cache-Control: max-age=0, no-store, no-cache"
echo ""

if [ "${REQUEST_METHOD}" = "POST" ]
then
    head -c "${CONTENT_LENGTH:-0}" > /tmp/playback.wav
    sed -i -e '1,/Content-Type:/d' /tmp/playback.wav
    echo " CONTENT LENGTH ${CONTENT_LENGTH}"
    /system/sdcard/bin/audioplay /tmp/playback.wav 60
fi
