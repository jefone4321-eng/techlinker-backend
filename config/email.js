const nodemailer = require('nodemailer');

// For development - uses Ethereal.email (fake SMTP service)
const createTransporter = async () => {
    // Create a test account on ethereal.email
    let testAccount = await nodemailer.createTestAccount();

    return nodemailer.createTransporter({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
            user: testAccount.user,
            pass: testAccount.pass,
        },
    });
};

// For production (uncomment and configure when ready)
/*
const createTransporter = () => {
    return nodemailer.createTransporter({
        service: 'Gmail', // or your email service
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });
};
*/

module.exports = { createTransporter };