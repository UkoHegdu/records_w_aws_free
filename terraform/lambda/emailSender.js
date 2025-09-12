// lambda/emailSender.js - Final step to send combined emails
const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const sesClient = new SESClient({ region: process.env.AWS_REGION });

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

// Send email using AWS SES
async function sendEmail(to, subject, text) {
    const params = {
        Source: process.env.SES_FROM_EMAIL,
        Destination: {
            ToAddresses: [to]
        },
        Message: {
            Subject: {
                Data: subject,
                Charset: 'UTF-8'
            },
            Body: {
                Text: {
                    Data: text,
                    Charset: 'UTF-8'
                }
            }
        }
    };

    try {
        const command = new SendEmailCommand(params);
        const result = await sesClient.send(command);
        console.log(`✅ Email sent successfully to ${to}, MessageId: ${result.MessageId}`);
        return result;
    } catch (error) {
        console.error(`❌ Failed to send email to ${to}:`, error.message);
        throw error;
    }
}
