-- Migration: Update admin user password
-- This updates the admin password to a fresh hash for Admin123!

UPDATE auth.users 
SET password_hash = '$argon2id$v=19$m=19456,t=2,p=1$izAsgdRc6sz8JVskBvjoag$vqwGHuK8ubEwYU1kqHlKeOa9HYqGn5L2jE8x1GNPja8' -- Admin123!
WHERE username = 'admin';

