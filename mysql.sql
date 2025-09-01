CREATE DATABASE IF NOT EXISTS recipesdb;
USE recipesdb;


CREATE TABLE users (
id INT AUTO_INCREMENT PRIMARY KEY,
username VARCHAR(100) NOT NULL,
email VARCHAR(200),
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE recipes (
id INT AUTO_INCREMENT PRIMARY KEY,
title VARCHAR(255) NOT NULL,
description TEXT,
ingredients TEXT,
method LONGTEXT,
created_by INT NULL,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);


-- sample join: list recipes and the user who created them (if any)
SELECT r.id, r.title, r.ingredients, u.username
FROM recipes r
LEFT JOIN users u ON r.created_by = u.id
ORDER BY r.created_at DESC;