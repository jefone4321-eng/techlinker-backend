const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000; // Vercel uses 3000

// Middleware
app.use(cors({
  origin: ["https://techlinker.netlify.app", "http://localhost:3000"],
  credentials: true
}));
app.use(express.json());

// Database connection
const db = require('../config/db');

// Test route
app.get('/', (req, res) => {
    res.json({ message: 'TechLinker API is running on Vercel!' });
});

// Health check route
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Test database route - FIXED
app.get('/test-db', async (req, res) => {
    try {
        const [results] = await db.pool.execute('SELECT 1 + 1 AS solution');
        res.json({ 
            message: 'Database connection successful!', 
            data: results[0] 
        });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ 
            error: 'Database connection failed', 
            details: err.message 
        });
    }
});

// ========== AUTH ROUTES ==========

// User registration with email verification - ALL FIXED
app.post('/api/auth/register', async (req, res) => {
    let connection;
    try {
        const { fullname, email, password, user_type } = req.body;
        console.log('📝 Registration attempt:', { fullname, email, user_type });
        
        // Check if user exists - FIXED
        const [existing] = await db.pool.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'User already exists with this email' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Use transaction to ensure both user and token are saved
        connection = await db.pool.getConnection();
        await connection.beginTransaction();

        console.log('🔄 Starting transaction...');

        // Insert user
        const [userResult] = await connection.execute(
            'INSERT INTO users (fullname, email, password, user_type) VALUES (?, ?, ?, ?)',
            [fullname, email, hashedPassword, user_type || 'talent']
        );

        const userId = userResult.insertId;
        console.log('✅ User created with ID:', userId);

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        
        console.log('🔑 Generated token:', verificationToken);

        // Save verification token
        const [tokenResult] = await connection.execute(
            'INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
            [userId, verificationToken, expiresAt]
        );
        
        console.log('✅ Token saved with ID:', tokenResult.insertId);

        // Commit transaction
        await connection.commit();
        console.log('✅ Transaction committed');

        // Generate JWT token
        const token = jwt.sign(
            { userId: userId, email: email },
            process.env.JWT_SECRET || 'fallback-secret',
            { expiresIn: '24h' }
        );
        
        console.log('🎉 Registration completed for user:', userId);

        res.json({
            message: 'User created successfully. Please verify your email.',
            token: token,
            user: {
                id: userId,
                fullname: fullname,
                email: email,
                user_type: user_type || 'talent',
                email_verified: false,
                profile_completed: false,
                needs_onboarding: true  
            }
        });
        
    } catch (error) {
        // Rollback transaction if there's an error
        if (connection) {
            await connection.rollback();
            console.log('❌ Transaction rolled back due to error');
        }
        
        console.error('❌ Registration error:', error);
        res.status(500).json({ 
            error: 'Internal server error: ' + error.message
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// User login - FIXED
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('🔑 Login attempt:', email);
        
        // Find user - FIXED
        const [users] = await db.pool.execute(
            'SELECT id, fullname, email, password, user_type, email_verified, profile_completed FROM users WHERE email = ?', 
            [email]
        );
        if (users.length === 0) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }
        
        const user = users[0];
        
        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET || 'fallback-secret',
            { expiresIn: '24h' }
        );
        
        console.log('✅ Login successful:', user.email);
        
        res.json({
            message: 'Login successful',
            token: token,
            user: {
                id: user.id,
                fullname: user.fullname,
                email: user.email,
                user_type: user.user_type,
                email_verified: user.email_verified,
                profile_completed: user.profile_completed,
                needs_onboarding: !user.profile_completed
            }
        });
        
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
});

// ========== EMAIL VERIFICATION ROUTES ==========

// Send verification email - FIXED
app.post('/api/auth/send-verification', async (req, res) => {
    try {
        const { email } = req.body;
        
        console.log('📧 Verification email requested for:', email);

        // Check if user exists - FIXED
        const [users] = await db.pool.execute('SELECT id, fullname, email_verified FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];

        // Check if already verified
        if (user.email_verified) {
            return res.json({ 
                message: 'Email is already verified' 
            });
        }

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // Delete any existing tokens for this user - FIXED
        await db.pool.execute('DELETE FROM email_verification_tokens WHERE user_id = ?', [user.id]);

        // Save new token to database - FIXED
        await db.pool.execute(
            'INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
            [user.id, verificationToken, expiresAt]
        );

        // Create verification link
        const verificationLink = `https://dynamic-bonbon-d418c6.netlify.app/verify-email?token=${verificationToken}`;

        console.log('✅ Verification token created:', verificationToken);

        res.json({ 
            message: 'Verification email sent successfully',
            debug: {
                token: verificationToken,
                verificationLink: verificationLink,
                note: 'In production, this would be sent via email'
            }
        });

    } catch (error) {
        console.error('❌ Send verification error:', error);
        res.status(500).json({ 
            error: 'Failed to send verification email',
            details: error.message 
        });
    }
});

// Verify email with token - FIXED
app.post('/api/auth/verify-email', async (req, res) => {
    let connection;
    try {
        const { token } = req.body;
        console.log('🔐 Email verification attempt for token:', token);

        // Find valid token using UTC time comparison - FIXED
        const [tokens] = await db.pool.execute(
            `SELECT evt.*, u.id as user_id, u.email, u.fullname 
             FROM email_verification_tokens evt 
             JOIN users u ON evt.user_id = u.id 
             WHERE evt.token = ? AND evt.expires_at > UTC_TIMESTAMP() AND evt.used = FALSE`,
            [token]
        );

        console.log('🔍 Tokens found:', tokens.length);

        if (tokens.length === 0) {
            return res.status(400).json({ 
                error: 'Invalid or expired verification token' 
            });
        }

        const verificationToken = tokens[0];

        // Mark email as verified and token as used
        connection = await db.pool.getConnection();
        
        try {
            await connection.beginTransaction();

            // Update user email verification status
            await connection.execute(
                'UPDATE users SET email_verified = TRUE WHERE id = ?',
                [verificationToken.user_id]
            );

            // Mark token as used
            await connection.execute(
                'UPDATE email_verification_tokens SET used = TRUE WHERE id = ?',
                [verificationToken.id]
            );

            await connection.commit();

            console.log('✅ Email verified successfully for user:', verificationToken.user_id);

            res.json({ 
                message: 'Email verified successfully!',
                user: {
                    id: verificationToken.user_id,
                    email: verificationToken.email,
                    fullname: verificationToken.fullname,
                    email_verified: true
                }
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            if (connection) connection.release();
        }

    } catch (error) {
        console.error('❌ Email verification error:', error);
        res.status(500).json({ error: 'Failed to verify email' });
    }
});

// ========== PROFILE ROUTES ==========

// Get user profile - FIXED
app.get('/api/profile/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Get user basic info - FIXED
        const [users] = await db.pool.execute(
            'SELECT id, fullname, email, user_type, email_verified, profile_completed, bio, location, website, github_url, linkedin_url, hourly_rate, availability FROM users WHERE id = ?', 
            [userId]
        );
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];
        
        res.json(user);
        
    } catch (error) {
        console.error('❌ Profile fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Update user profile - FIXED
app.put('/api/profile/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const { fullname, bio, location, website, github_url, linkedin_url, hourly_rate, availability } = req.body;
        
        console.log('📝 Update profile request:', {
            userId,
            fullname,
            bio,
            location,
            website,
            github_url,
            linkedin_url,
            hourly_rate,
            availability
        });

        // First, check if user exists - FIXED
        const [users] = await db.pool.execute('SELECT id FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Build dynamic update query (only update provided fields)
        let updateFields = [];
        let updateValues = [];

        if (fullname !== undefined) {
            updateFields.push('fullname = ?');
            updateValues.push(fullname);
        }
        if (bio !== undefined) {
            updateFields.push('bio = ?');
            updateValues.push(bio);
        }
        if (location !== undefined) {
            updateFields.push('location = ?');
            updateValues.push(location);
        }
        if (website !== undefined) {
            updateFields.push('website = ?');
            updateValues.push(website);
        }
        if (github_url !== undefined) {
            updateFields.push('github_url = ?');
            updateValues.push(github_url);
        }
        if (linkedin_url !== undefined) {
            updateFields.push('linkedin_url = ?');
            updateValues.push(linkedin_url);
        }
        if (hourly_rate !== undefined) {
            updateFields.push('hourly_rate = ?');
            updateValues.push(hourly_rate);
        }
        if (availability !== undefined) {
            updateFields.push('availability = ?');
            updateValues.push(availability);
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        updateValues.push(userId);

        const updateQuery = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
        
        console.log('🔧 Executing query:', updateQuery);
        console.log('📊 With values:', updateValues);

        const [result] = await db.pool.execute(updateQuery, updateValues);
        
        console.log('✅ Update result:', result);

        res.json({ 
            message: 'Profile updated successfully',
            affectedRows: result.affectedRows
        });
        
    } catch (error) {
        console.error('❌ Profile update error:', error);
        res.status(500).json({ 
            error: 'Failed to update profile',
            details: error.message
        });
    }
});

// ========== SKILLS ROUTES ==========

// Get all available skills - FIXED
app.get('/api/skills', async (req, res) => {
    try {
        const [skills] = await db.pool.execute('SELECT * FROM skills ORDER BY name');
        res.json(skills);
    } catch (error) {
        console.error('❌ Skills fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch skills' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔐 JWT Secret: ${process.env.JWT_SECRET ? 'Set' : 'Using fallback'}`);
});

// EXPORT FOR VERCEL (CRITICAL)
module.exports = app;