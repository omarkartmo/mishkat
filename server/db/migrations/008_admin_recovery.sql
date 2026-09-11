-- Add Security Question and Answer Hash to Users Table
ALTER TABLE users ADD COLUMN security_question TEXT;
ALTER TABLE users ADD COLUMN security_answer_hash VARCHAR(255);