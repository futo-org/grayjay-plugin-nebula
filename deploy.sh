#!/bin/sh
DOCUMENT_ROOT=/var/www/sources

# Take site offline
echo "Taking site offline..."
touch $DOCUMENT_ROOT/maintenance.file

# Swap over the content
echo "Deploying content..."
mkdir -p $DOCUMENT_ROOT/Nebula
cp NebulaIcon.png $DOCUMENT_ROOT/Nebula
cp NebulaConfig.json $DOCUMENT_ROOT/Nebula
cp NebulaScript.js $DOCUMENT_ROOT/Nebula
sh sign.sh $DOCUMENT_ROOT/Nebula/NebulaScript.js $DOCUMENT_ROOT/Nebula/NebulaConfig.json

# Notify Cloudflare to wipe the CDN cache
echo "Purging Cloudflare cache for zone $CLOUDFLARE_ZONE_ID..."
curl -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/purge_cache" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{"files":["https://plugins.grayjay.app/Nebula/NebulaIcon.png", "https://plugins.grayjay.app/Nebula/NebulaConfig.json", "https://plugins.grayjay.app/Nebula/NebulaScript.js"]}'

# Take site back online
echo "Bringing site back online..."
rm $DOCUMENT_ROOT/maintenance.file
