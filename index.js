const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

// Configuration
const SCOPES = ['https://www.googleapis.com/auth/drive'];
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

// Create OAuth2 client
async function loadCredentials() {
    try {
        const content = await fs.readFile(CREDENTIALS_PATH);
        return JSON.parse(content);
    } catch (error) {
        console.error('Error loading credentials:', error.message);
        throw error;
    }
}

// Authorize the client
async function authorize() {
    const credentials = await loadCredentials();
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    try {
        const token = await fs.readFile(TOKEN_PATH);
        oAuth2Client.setCredentials(JSON.parse(token));
        return oAuth2Client;
    } catch (error) {
        return await getNewToken(oAuth2Client);
    }
}

// Get new token if none exists
async function getNewToken(oAuth2Client) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve, reject) => {
        rl.question('Enter the code from that page here: ', (code) => {
            rl.close();
            oAuth2Client.getToken(code, async (err, token) => {
                if (err) {
                    console.error('Error retrieving access token:', err);
                    return reject(err);
                }
                oAuth2Client.setCredentials(token);
                try {
                    await fs.writeFile(TOKEN_PATH, JSON.stringify(token));
                    console.log('Token stored to', TOKEN_PATH);
                    resolve(oAuth2Client);
                } catch (error) {
                    console.error('Error saving token:', error.message);
                    reject(error);
                }
            });
        });
    });
}

// Transfer ownership of a file
async function transferOwnership(auth, fileId, newOwnerEmail) {
    const drive = google.drive({ version: 'v3', auth });

    try {
        
            // Step 1: Create a permission for the new owner with pendingOwner status
    const permission = await drive.permissions.create({
        fileId: fileId,
        sendNotificationEmail: true, // Sends email to new owner
        transferOwnership: true,
        requestBody: {
          role: 'owner', // Initially set as writer
          type: 'user',
          emailAddress: newOwnerEmail,
          pendingOwner: true, // Marks as pending owner
        },
        fields: 'id',
      });
      console.log(`Pending ownership set for ${newOwnerEmail}. Permission ID: ${permission.data.id}`);
      console.log(`An email has been sent to ${newOwnerEmail} to accept ownership.`);
    } catch (error) {
        if (error.message.includes('Consent is required')) {
            console.error('Consent is required to transfer ownership. Please ensure the new owner accepts the file access or check Google Workspace restrictions.');
        } else {
            console.error('Error transferring ownership:', error.message);
        }
        throw error;
    }
}

// Main function
async function main(fileId, newOwnerEmail) {
    try {
        if (!fileId || !newOwnerEmail) {
            throw new Error('File ID and new owner email are required');
        }
        const auth = await authorize();
        await transferOwnership(auth, fileId, newOwnerEmail);
    } catch (error) {
        console.error('Error in main execution:', error.message);
        process.exit(1);
    }
}

// Run the application
const args = process.argv.slice(2);
if (args.length !== 2) {
    console.log('Usage: node transferOwnership.js <fileId> <newOwnerEmail>');
    process.exit(1);
}

main(args[0], args[1]);