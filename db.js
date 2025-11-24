const mysql = require('mysql2/promise');
require('dotenv').config();

// Create connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'techlinker',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test connection
pool.getConnection()
    .then(connection => {
        console.log('✅ Database connection established');
        connection.release();
    })
    .catch(err => {
        console.error('❌ Database connection failed:', err.message);
    });

// Export functions for manual initialization (don't call them automatically)
module.exports = {
    pool,
    initializeDatabase: async function() {
        try {
            console.log('🔄 Initializing database...');

            // Users table
            const usersTableSQL = `
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    fullname VARCHAR(100) NOT NULL,
                    email VARCHAR(100) UNIQUE NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    user_type ENUM('talent', 'employer') DEFAULT 'talent',
                    
                    profile_completed BOOLEAN DEFAULT FALSE,
                    profession VARCHAR(100),
                    company VARCHAR(100),
                    job_title VARCHAR(100),
                    years_experience INT,
                    hobbies TEXT,
                    about_me TEXT,
                    goals TEXT,
                    
                    bio TEXT,
                    location VARCHAR(100),
                    website VARCHAR(255),
                    github_url VARCHAR(255),
                    linkedin_url VARCHAR(255),
                    profile_picture VARCHAR(255),
                    hourly_rate DECIMAL(10,2),
                    availability ENUM('available', 'not_available', 'part_time') DEFAULT 'available',
                    email_verified BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `;
            await pool.execute(usersTableSQL);
            console.log('✅ Users table ready');

            // Skills table
            const skillsTableSQL = `
                CREATE TABLE IF NOT EXISTS skills (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(50) UNIQUE NOT NULL,
                    category VARCHAR(50),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `;
            await pool.execute(skillsTableSQL);
            console.log('✅ Skills table ready');

            // User Skills table
            const userSkillsTableSQL = `
                CREATE TABLE IF NOT EXISTS user_skills (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    skill_id INT NOT NULL,
                    proficiency ENUM('beginner', 'intermediate', 'advanced', 'expert') DEFAULT 'intermediate',
                    experience_years INT DEFAULT 0,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
                    UNIQUE KEY unique_user_skill (user_id, skill_id)
                )
            `;
            await pool.execute(userSkillsTableSQL);
            console.log('✅ User skills table ready');

            // Email verification tokens table
            const emailVerificationTableSQL = `
                CREATE TABLE IF NOT EXISTS email_verification_tokens (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    token VARCHAR(255) UNIQUE NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    used BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `;
            await pool.execute(emailVerificationTableSQL);
            console.log('✅ Email verification tokens table ready');

            // Password reset tokens table
            const passwordResetTableSQL = `
                CREATE TABLE IF NOT EXISTS password_reset_tokens (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    token VARCHAR(255) UNIQUE NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    used BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `;
            await pool.execute(passwordResetTableSQL);
            console.log('✅ Password reset tokens table ready');

            // Insert default skills
            await this.insertDefaultSkills();

            console.log('🎉 Database initialization completed!');

        } catch (error) {
            console.error('❌ Database initialization failed:', error.message);
            throw error;
        }
    },
    
    insertDefaultSkills: async function() {
        const defaultSkills = [
            'JavaScript', 'Python', 'Java', 'React', 'Node.js', 'HTML', 'CSS',
            'SQL', 'MongoDB', 'Express.js', 'Vue.js', 'Angular', 'TypeScript',
            'PHP', 'Ruby', 'Swift', 'Kotlin', 'Go', 'Rust', 'C++', 'C#',
            'AWS', 'Docker', 'Kubernetes', 'Git', 'Linux', 'Redis', 'MySQL',
            'PostgreSQL', 'Firebase', 'GraphQL', 'REST API', 'Machine Learning',
            'Data Analysis', 'UI/UX Design', 'Project Management', 'Agile', 'Scrum'
        ];

        try {
            for (const skillName of defaultSkills) {
                await pool.execute(
                    'INSERT IGNORE INTO skills (name) VALUES (?)',
                    [skillName]
                );
            }
            console.log('✅ Default skills inserted');
        } catch (error) {
            console.log('✅ Skills already exist');
        }
    }
};