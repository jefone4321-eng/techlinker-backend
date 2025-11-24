const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({
  origin: ["https://dynamic-bonbon-d418c6.netlify.app/", "http://localhost:3000"],
  credentials: true
}));
app.use(express.json());

// Database connection
const db = require('./config/db');

// Test route
app.get('/', (req, res) => {
    res.json({ message: 'TechLinker API is running!' });
});

// Test database route
app.get('/test-db', async (req, res) => {
    try {
        const [results] = await db.execute('SELECT 1 + 1 AS solution');
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

// User registration with email verification
app.post('/api/auth/register', async (req, res) => {
    let connection;
    try {
        const { fullname, email, password, user_type } = req.body;
        console.log('📝 Registration attempt:', { fullname, email, user_type });
        
        // Check if user exists
        const [existing] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'User already exists with this email' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Use transaction to ensure both user and token are saved
        connection = await db.getConnection();
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
            },
            debug: {
                verificationToken: verificationToken,
                userId: userId,
                note: 'Use this token to verify email'
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
            error: 'Internal server error: ' + error.message,
            sqlMessage: error.sqlMessage 
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// User login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('🔑 Login attempt:', email);
        
        // Find user
        const [users] = await db.execute(
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

// Send verification email
app.post('/api/auth/send-verification', async (req, res) => {
    try {
        const { email } = req.body;
        
        console.log('📧 Verification email requested for:', email);

        // Check if user exists
        const [users] = await db.execute('SELECT id, fullname, email_verified FROM users WHERE email = ?', [email]);
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

        // Delete any existing tokens for this user
        await db.execute('DELETE FROM email_verification_tokens WHERE user_id = ?', [user.id]);

        // Save new token to database
        await db.execute(
            'INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
            [user.id, verificationToken, expiresAt]
        );

        // Create verification link
       const verificationLink = `https://dynamic-bonbon-d418c6.netlify.app//verify-email?token=${verificationToken}`;
        // For now, just return the token (skip actual email)
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

// Verify email with token
app.post('/api/auth/verify-email', async (req, res) => {
    let connection;
    try {
        const { token } = req.body;
        console.log('🔐 Email verification attempt for token:', token);

        // Find valid token using UTC time comparison
        const [tokens] = await db.execute(
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
        connection = await db.getConnection();
        
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

// Check verification status
app.get('/api/auth/verification-status/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        const [users] = await db.execute(
            'SELECT id, email, email_verified FROM users WHERE id = ?', 
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ 
            email: users[0].email,
            email_verified: users[0].email_verified
        });

    } catch (error) {
        console.error('❌ Verification status error:', error);
        res.status(500).json({ error: 'Failed to check verification status' });
    }
});

// ========== PASSWORD RESET ROUTES ==========

// Request password reset
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        console.log('🔐 Password reset requested for:', email);

        // Check if user exists
        const [users] = await db.execute('SELECT id, fullname FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.json({ 
                message: 'If the email exists, a password reset link has been sent.' 
            });
        }

        const user = users[0];

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000);

        // Save token to database
        await db.execute(
            'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
            [user.id, resetToken, expiresAt]
        );

        // For now, just return the token (skip email)
        console.log('✅ Reset token created:', resetToken);

        res.json({ 
            message: 'If the email exists, a password reset link has been sent.',
            debug: {
                token: resetToken,
                note: 'In production, this would be sent via email'
            }
        });

    } catch (error) {
        console.error('❌ Password reset error:', error);
        res.status(500).json({ 
            error: 'Failed to process password reset request',
            details: error.message 
        });
    }
});

// Verify reset token
app.get('/api/auth/verify-reset-token', async (req, res) => {
    try {
        const { token } = req.query;

        // Find valid token using UTC time comparison
        const [tokens] = await db.execute(
            `SELECT pt.*, u.email 
             FROM password_reset_tokens pt 
             JOIN users u ON pt.user_id = u.id 
             WHERE pt.token = ? AND pt.expires_at > UTC_TIMESTAMP() AND pt.used = FALSE`,
            [token]
        );

        if (tokens.length === 0) {
            return res.status(400).json({ 
                error: 'Invalid or expired reset token' 
            });
        }

        res.json({ 
            valid: true,
            email: tokens[0].email 
        });

    } catch (error) {
        console.error('❌ Token verification error:', error);
        res.status(500).json({ error: 'Failed to verify token' });
    }
});

// Reset password with token
app.post('/api/auth/reset-password', async (req, res) => {
    let connection;
    try {
        const { token, newPassword } = req.body;

        // Find valid token using UTC time comparison
        const [tokens] = await db.execute(
            `SELECT pt.*, u.id as user_id 
             FROM password_reset_tokens pt 
             JOIN users u ON pt.user_id = u.id 
             WHERE pt.token = ? AND pt.expires_at > UTC_TIMESTAMP() AND pt.used = FALSE`,
            [token]
        );

        if (tokens.length === 0) {
            return res.status(400).json({ 
                error: 'Invalid or expired reset token' 
            });
        }

        const resetToken = tokens[0];

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update user password and mark token as used (in transaction)
        connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();

            // Update password
            await connection.execute(
                'UPDATE users SET password = ? WHERE id = ?',
                [hashedPassword, resetToken.user_id]
            );

            // Mark token as used
            await connection.execute(
                'UPDATE password_reset_tokens SET used = TRUE WHERE id = ?',
                [resetToken.id]
            );

            await connection.commit();

            console.log('✅ Password reset successful for user:', resetToken.user_id);

            res.json({ 
                message: 'Password reset successfully' 
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            if (connection) connection.release();
        }

    } catch (error) {
        console.error('❌ Password reset error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// ========== PROFILE ROUTES ==========

// Get user profile
app.get('/api/profile/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Get user basic info
        const [users] = await db.execute(
            'SELECT id, fullname, email, user_type, email_verified, profile_completed, bio, location, website, github_url, linkedin_url, hourly_rate, availability, profession, company, job_title, years_experience, about_me, hobbies, goals FROM users WHERE id = ?', 
            [userId]
        );
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];
        
        // Get user skills with skill names
        const [skills] = await db.execute(
            `SELECT s.name, us.proficiency, us.experience_years 
             FROM user_skills us 
             JOIN skills s ON us.skill_id = s.id 
             WHERE us.user_id = ?`,
            [userId]
        );
        
        res.json({
            ...user,
            skills: skills
        });
        
    } catch (error) {
        console.error('❌ Profile fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Update user profile
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

        // First, check if user exists
        const [users] = await db.execute('SELECT id FROM users WHERE id = ?', [userId]);
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

        const [result] = await db.execute(updateQuery, updateValues);
        
        console.log('✅ Update result:', result);

        res.json({ 
            message: 'Profile updated successfully',
            affectedRows: result.affectedRows
        });
        
    } catch (error) {
        console.error('❌ Profile update error:', error);
        res.status(500).json({ 
            error: 'Failed to update profile',
            details: error.message,
            sqlMessage: error.sqlMessage 
        });
    }
});

// ========== SKILLS ROUTES ==========

// Get all available skills
app.get('/api/skills', async (req, res) => {
    try {
        const [skills] = await db.execute('SELECT * FROM skills ORDER BY name');
        res.json(skills);
    } catch (error) {
        console.error('❌ Skills fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch skills' });
    }
});

// Add skill to user profile
app.post('/api/profile/:userId/skills', async (req, res) => {
    try {
        const userId = req.params.userId;
        const { skillName, proficiency = 'intermediate', experience_years = 0 } = req.body;
        
        // First, get or create the skill
        let [skills] = await db.execute('SELECT id FROM skills WHERE name = ?', [skillName]);
        let skillId;

        if (skills.length === 0) {
            // Create new skill
            const [result] = await db.execute('INSERT INTO skills (name) VALUES (?)', [skillName]);
            skillId = result.insertId;
        } else {
            skillId = skills[0].id;
        }

        // Add skill to user
        await db.execute(
            'INSERT INTO user_skills (user_id, skill_id, proficiency, experience_years) VALUES (?, ?, ?, ?)',
            [userId, skillId, proficiency, experience_years]
        );

        res.json({ message: 'Skill added to profile' });
        
    } catch (error) {
        console.error('❌ Add skill error:', error);
        res.status(500).json({ error: 'Failed to add skill' });
    }
});

// Remove skill from user profile
app.delete('/api/profile/:userId/skills/:skillId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const skillId = req.params.skillId;
        
        await db.execute('DELETE FROM user_skills WHERE user_id = ? AND skill_id = ?', [userId, skillId]);
        
        res.json({ message: 'Skill removed from profile' });
        
    } catch (error) {
        console.error('❌ Remove skill error:', error);
        res.status(500).json({ error: 'Failed to remove skill' });
    }
});

// ========== USER MANAGEMENT ROUTES ==========

// Get all users (for admin purposes)
app.get('/api/users', async (req, res) => {
    try {
        const [users] = await db.execute(
            'SELECT id, fullname, email, user_type, email_verified, profile_completed, created_at FROM users'
        );
        res.json(users);
    } catch (error) {
        console.error('❌ Users fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// ========== DEBUG & UTILITY ROUTES ==========

// Check current user data
app.get('/api/debug/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const [users] = await db.execute(
            'SELECT id, fullname, email, user_type, email_verified, profile_completed, profession, company, job_title, years_experience, created_at FROM users WHERE id = ?', 
            [userId]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];
        
        res.json(user);
        
    } catch (error) {
        console.error('Debug error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Check verification table
app.get('/api/debug/check-verification-table', async (req, res) => {
    try {
        const [tables] = await db.execute("SHOW TABLES LIKE 'email_verification_tokens'");
        
        if (tables.length === 0) {
            return res.json({ 
                exists: false,
                message: 'email_verification_tokens table does not exist' 
            });
        }

        // Check table structure
        const [columns] = await db.execute('DESCRIBE email_verification_tokens');
        
        res.json({ 
            exists: true,
            columns: columns
        });

    } catch (error) {
        console.error('❌ Check table error:', error);
        res.status(500).json({ 
            error: 'Error checking table',
            details: error.message 
        });
    }
});

// Debug route to check verification tokens
app.get('/api/debug/check-tokens', async (req, res) => {
    try {
        // Check all verification tokens
        const [tokens] = await db.execute(`
            SELECT evt.*, u.email, u.fullname 
            FROM email_verification_tokens evt 
            JOIN users u ON evt.user_id = u.id 
            ORDER BY evt.created_at DESC
        `);
        
        // Check users email verification status
        const [users] = await db.execute(`
            SELECT id, email, fullname, email_verified, profile_completed
            FROM users 
            ORDER BY created_at DESC
        `);

        res.json({
            verificationTokens: tokens,
            users: users,
            totalTokens: tokens.length,
            totalUsers: users.length
        });

    } catch (error) {
        console.error('❌ Debug tokens error:', error);
        res.status(500).json({ 
            error: 'Debug error',
            details: error.message 
        });
    }
});

// Manual verification for testing
app.post('/api/debug/manual-verify', async (req, res) => {
    try {
        const { userId } = req.body;
        
        // Manually verify user
        await db.execute(
            'UPDATE users SET email_verified = TRUE WHERE id = ?',
            [userId]
        );

        res.json({ 
            message: 'User manually verified',
            userId: userId
        });

    } catch (error) {
        console.error('❌ Manual verify error:', error);
        res.status(500).json({ 
            error: 'Manual verification failed',
            details: error.message 
        });
    }
});

// ========== ONBOARDING ROUTES ==========

// Get onboarding status
app.get('/api/onboarding/status/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        const [users] = await db.execute(
            'SELECT id, fullname, profile_completed, profession, company FROM users WHERE id = ?', 
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];

        res.json({ 
            profile_completed: user.profile_completed,
            fullname: user.fullname,
            profession: user.profession,
            company: user.company,
            needs_onboarding: !user.profile_completed
        });

    } catch (error) {
        console.error('❌ Onboarding status error:', error);
        res.status(500).json({ error: 'Failed to check onboarding status' });
    }
});

// Complete onboarding step 1: Basic info
app.post('/api/onboarding/basic-info', async (req, res) => {
    try {
        const { userId, fullname, profession, company, job_title, years_experience } = req.body;
        
        console.log('📝 Onboarding basic info for user:', userId);

        // Update user basic info
        await db.execute(
            `UPDATE users 
             SET fullname = ?, profession = ?, company = ?, job_title = ?, years_experience = ?
             WHERE id = ?`,
            [fullname, profession, company, job_title, years_experience, userId]
        );

        res.json({ 
            message: 'Basic information updated successfully',
            next_step: 'personal_details'
        });

    } catch (error) {
        console.error('❌ Basic info update error:', error);
        res.status(500).json({ error: 'Failed to update basic information' });
    }
});

// Complete onboarding step 2: Personal details
app.post('/api/onboarding/personal-details', async (req, res) => {
    try {
        const { userId, about_me, hobbies, goals } = req.body;
        
        console.log('📝 Onboarding personal details for user:', userId);

        // Update personal details
        await db.execute(
            `UPDATE users 
             SET about_me = ?, hobbies = ?, goals = ?
             WHERE id = ?`,
            [about_me, hobbies, goals, userId]
        );

        res.json({ 
            message: 'Personal details updated successfully',
            next_step: 'skills'
        });

    } catch (error) {
        console.error('❌ Personal details update error:', error);
        res.status(500).json({ error: 'Failed to update personal details' });
    }
});

// Complete onboarding step 3: Skills
app.post('/api/onboarding/skills', async (req, res) => {
    try {
        const { userId, skills } = req.body;
        
        console.log('📝 Onboarding skills for user:', userId, skills);

        // Add skills to user profile
        for (const skill of skills) {
            let [existingSkills] = await db.execute('SELECT id FROM skills WHERE name = ?', [skill.name]);
            let skillId;

            if (existingSkills.length === 0) {
                const [result] = await db.execute('INSERT INTO skills (name) VALUES (?)', [skill.name]);
                skillId = result.insertId;
            } else {
                skillId = existingSkills[0].id;
            }

            // Add skill to user
            await db.execute(
                'INSERT IGNORE INTO user_skills (user_id, skill_id, proficiency, experience_years) VALUES (?, ?, ?, ?)',
                [userId, skillId, skill.proficiency || 'intermediate', skill.experience_years || 0]
            );
        }

        res.json({ 
            message: 'Skills added successfully',
            next_step: 'complete'
        });

    } catch (error) {
        console.error('❌ Skills update error:', error);
        res.status(500).json({ error: 'Failed to update skills' });
    }
});

// Complete onboarding (mark profile as completed)
app.post('/api/onboarding/complete', async (req, res) => {
    try {
        const { userId } = req.body;
        
        console.log('🎉 Completing onboarding for user:', userId);

        // Mark profile as completed
        await db.execute(
            'UPDATE users SET profile_completed = TRUE WHERE id = ?',
            [userId]
        );

        // Get updated user data
        const [users] = await db.execute(
            `SELECT id, fullname, email, user_type, profile_completed, 
                    profession, company, job_title, years_experience,
                    about_me, hobbies, goals, email_verified
             FROM users WHERE id = ?`,
            [userId]
        );

        const user = users[0];

        res.json({ 
            message: 'Onboarding completed successfully!',
            user: user,
            onboarding_complete: true
        });

    } catch (error) {
        console.error('❌ Onboarding completion error:', error);
        res.status(500).json({ error: 'Failed to complete onboarding' });
    }
});

// Get all onboarding data for a user
app.get('/api/onboarding/data/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        const [users] = await db.execute(
            `SELECT id, fullname, email, user_type, profile_completed,
                    profession, company, job_title, years_experience,
                    about_me, hobbies, goals, bio, location,
                    website, github_url, linkedin_url
             FROM users WHERE id = ?`,
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];

        // Get user skills
        const [skills] = await db.execute(
            `SELECT s.name, us.proficiency, us.experience_years 
             FROM user_skills us 
             JOIN skills s ON us.skill_id = s.id 
             WHERE us.user_id = ?`,
            [userId]
        );

        res.json({
            ...user,
            skills: skills
        });

    } catch (error) {
        console.error('❌ Onboarding data error:', error);
        res.status(500).json({ error: 'Failed to fetch onboarding data' });
    }
});

// Update table structure for onboarding (Safe migration)
app.get('/api/debug/update-onboarding-fields', async (req, res) => {
  try {
    const results = [];
    
    // Array of columns to add
    const columns = [
      {
        name: 'profile_completed',
        definition: 'BOOLEAN DEFAULT FALSE'
      },
      {
        name: 'profession', 
        definition: 'VARCHAR(100)'
      },
      {
        name: 'company',
        definition: 'VARCHAR(100)'
      },
      {
        name: 'job_title',
        definition: 'VARCHAR(100)'
      },
      {
        name: 'years_experience',
        definition: 'INT'
      },
      {
        name: 'about_me',
        definition: 'TEXT'
      },
      {
        name: 'hobbies',
        definition: 'TEXT'
      },
      {
        name: 'goals',
        definition: 'TEXT'
      }
    ];

    // Add each column safely
    for (const column of columns) {
      try {
        // Check if column exists first
        const checkQuery = `
          SELECT COUNT(*) as count 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'users' 
          AND COLUMN_NAME = ?
        `;
        
        const [checkResult] = await db.execute(checkQuery, [column.name]);
        
        if (checkResult[0].count === 0) {
          // Column doesn't exist, add it
          const alterQuery = `ALTER TABLE users ADD COLUMN ${column.name} ${column.definition}`;
          await db.execute(alterQuery);
          results.push(`✓ Added column: ${column.name}`);
        } else {
          results.push(`✓ Column already exists: ${column.name}`);
        }
      } catch (error) {
        results.push(`✗ Error with ${column.name}: ${error.message}`);
      }
    }

    res.json({
      message: "Onboarding fields update completed",
      results: results
    });

  } catch (error) {
    console.error('❌ Update onboarding fields error:', error);
    res.status(500).json({
      message: "Update failed",
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Database: ${process.env.DB_NAME || 'techlinker'}`);
    console.log(`✅ Database connection established`);
    console.log(`🔐 JWT Secret: ${process.env.JWT_SECRET ? 'Set' : 'Using fallback'}`);
});