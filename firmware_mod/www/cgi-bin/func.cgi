#!/bin/sh
# Parse GET/POST parameters into F_<name> variables
# Source: http://isquared.nl/blog/2008/11/01/Bourne-Bash-Shell-CGI-Scripts/
# Uses shell builtins only so that sourcing this file costs no fork for GET requests

if [ "${REQUEST_METHOD}" = "POST" ]
then
  POST_QUERY_STRING=$(head -c "${CONTENT_LENGTH:-0}" 2>/dev/null)
  if [ "${QUERY_STRING}" != "" ]
  then
      QUERY_STRING=${POST_QUERY_STRING}"&"${QUERY_STRING}
  else
      QUERY_STRING=${POST_QUERY_STRING}"&"
  fi
fi

_IFS=${IFS}; IFS=\&
# Don't let wildcards in the query string expand to file names
set -f
for _VAR in ${QUERY_STRING}
do
  _NAME=${_VAR%%=*}
  # Only accept valid variable names: request data must never reach eval
  case "${_NAME}" in
    ""|*[!A-Za-z0-9_]*) continue ;;
  esac
  eval "F_${_NAME}=\${_VAR#*=}"
done
set +f
IFS=${_IFS}
unset _IFS _VAR _NAME
