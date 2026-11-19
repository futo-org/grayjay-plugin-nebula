#!/bin/sh
set -eu

sh "$(dirname "$0")/publish-r2.sh" Nebula NebulaConfig.json NebulaConfig.json NebulaScript.js NebulaIcon.png
