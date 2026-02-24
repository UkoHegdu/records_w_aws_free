// lambda/emailSender.js - Final step to send combined emails
// Uses Gmail SMTP (port 587) - same config as new_backend
const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const nodemailer = require('nodemailer');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

let transporter = null;
const getTransporter = () => {
    if (transporter) return transporter;
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    if (!user || !pass) {
        throw new Error('EMAIL_USER and EMAIL_PASS required for email');
    }
    // Port 587: many providers block outbound 465
    transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user, pass }
    });
    return transporter;
};

exports.handler = async (event, context) => {
    console.log('📧 Email Sender Lambda triggered!', event);

    try {
        // Get all email bodies from DynamoDB for today
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        console.log(`📅 Processing emails for date: ${today}`);

        const scanParams = {
            TableName: process.env.DAILY_EMAILS_TABLE_NAME,
            FilterExpression: '#date = :date',
            ExpressionAttributeNames: {
                '#date': 'date'
            },
            ExpressionAttributeValues: {
                ':date': { S: today }
            }
        };

        const result = await dynamoClient.send(new ScanCommand(scanParams));
        const emailBodies = result.Items.map(item => unmarshall(item));

        console.log(`📬 Found ${emailBodies.length} email bodies to process`);

        let emailsSent = 0;
        let emailsSkipped = 0;

        for (const emailBody of emailBodies) {
            try {
                // Check if there's any content to send
                const hasMapperContent = emailBody.mapper_content && emailBody.mapper_content.trim().length > 0;
                const hasDriverContent = emailBody.driver_content && emailBody.driver_content.trim().length > 0;

                if (!hasMapperContent && !hasDriverContent) {
                    console.log(`⏭️ Skipping email for user ${emailBody.user_id} - no content to send`);
                    emailsSkipped++;
                    continue;
                }

                // Build the email content
                let emailText = '';
                let subject = '';

                if (hasMapperContent && hasDriverContent) {
                    // Combined email
                    subject = `Daily Update: New Records & Position Changes`;
                    emailText = `Hello ${emailBody.username}!\n\n`;
                    emailText += `Here's your daily Trackmania update:\n\n`;

                    if (hasMapperContent) {
                        emailText += `🗺️ NEW RECORDS ON YOUR MAPS:\n`;
                        emailText += `${emailBody.mapper_content}\n\n`;
                    }

                    if (hasDriverContent) {
                        emailText += `🏎️ POSITION CHANGES:\n`;
                        emailText += `${emailBody.driver_content}\n\n`;
                    }
                } else if (hasMapperContent) {
                    // Mapper alerts only
                    subject = `New times in ${emailBody.username}'s maps`;
                    emailText = `New times have been driven on your map(s):\n\n${emailBody.mapper_content}`;
                } else if (hasDriverContent) {
                    // Driver notifications only
                    subject = `Position Changes on Tracked Maps`;
                    emailText = `Hello ${emailBody.username}!\n\n`;
                    emailText += `Here are the position changes on maps you're tracking:\n\n${emailBody.driver_content}`;
                }

                // Send the email
                await sendEmail(emailBody.email, subject, emailText);
                console.log(`✅ Email sent to ${emailBody.email}`);
                emailsSent++;

            } catch (error) {
                console.error(`❌ Error sending email to user ${emailBody.user_id}:`, error.message);
                // Continue with other emails even if one fails
            }
        }

        console.log(`📊 Email Summary: ${emailsSent} sent, ${emailsSkipped} skipped`);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Email sending completed',
                emailsSent: emailsSent,
                emailsSkipped: emailsSkipped,
                totalProcessed: emailBodies.length
            })
        };

    } catch (error) {
        console.error('❌ Email sender error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Email sending failed',
                details: error.message
            })
        };
    }
};

// Send email using Gmail SMTP (port 587)
async function sendEmail(to, subject, text) {
    const from = process.env.EMAIL_USER;
    if (!from) throw new Error('EMAIL_USER required for email from address');
    const transport = getTransporter();
    const info = await transport.sendMail({ from, to, subject, text });
    console.log(`✅ Email sent to ${to}, messageId: ${info.messageId}`);
    return info;
}
