#!/bin/bash

# testDriverNotifications.sh - Test script for driver notifications
# This script helps test the driver notification system without requiring actual top 5 positions

echo "🧪 Driver Notification Test Suite"
echo "=================================="
echo ""

# Set environment variables for testing
export AWS_REGION="us-east-1"
export NEON_DB_CONNECTION_STRING="your_test_db_connection_string"
export DAILY_EMAILS_TABLE_NAME="test-daily-emails"
export DRIVER_NOTIFICATION_QUEUE_URL="https://sqs.us-east-1.amazonaws.com/123456789012/test-driver-notification-queue"
export SCHEDULER_QUEUE_URL="https://sqs.us-east-1.amazonaws.com/123456789012/test-scheduler-queue"

echo "📋 Available Tests:"
echo "1. Test Driver Notification Logic"
echo "2. Test Email Composition"
echo "3. Test Complete Integration"
echo "4. Run All Tests"
echo ""

read -p "Select test to run (1-4): " choice

case $choice in
    1)
        echo "🔄 Running Driver Notification Logic Tests..."
        node lambda/testDriverNotifications.js
        ;;
    2)
        echo "📧 Running Email Composition Tests..."
        node lambda/testEmailComposition.js
        ;;
    3)
        echo "🔗 Running Complete Integration Tests..."
        node lambda/testDriverNotificationIntegration.js
        ;;
    4)
        echo "🧪 Running All Tests..."
        echo ""
        echo "1️⃣ Driver Notification Logic Tests:"
        node lambda/testDriverNotifications.js
        echo ""
        echo "2️⃣ Email Composition Tests:"
        node lambda/testEmailComposition.js
        echo ""
        echo "3️⃣ Complete Integration Tests:"
        node lambda/testDriverNotificationIntegration.js
        ;;
    *)
        echo "❌ Invalid choice. Please run the script again."
        exit 1
        ;;
esac

echo ""
echo "✅ Test execution completed!"
