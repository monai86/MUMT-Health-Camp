#!/bin/bash
# MUMT Health Camp - Deploy & Update Script
# วิธีใช้: ./deploy.sh

set -e

echo ""
echo "🏥 MUMT Health Camp — Deploy Script"
echo "===================================="
echo ""

# Step 1: Rebuild Docker image with latest code
echo "📦 กำลัง Build Docker Image ใหม่..."
docker-compose up -d --build

echo ""
echo "✅ อัปเดตเสร็จเรียบร้อย!"
echo ""

# Step 2: Show container status
echo "📊 สถานะ Container:"
docker ps --filter "name=excel_admin_app" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "🌐 เว็บพร้อมใช้งานที่: http://localhost:3000"
echo ""
echo "💡 ถ้าต้องการเปิด Cloudflare Tunnel ให้รัน:"
echo "   cloudflared tunnel --url http://localhost:3000"
echo ""
