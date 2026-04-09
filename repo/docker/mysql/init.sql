-- Ensure the harborops database uses utf8mb4
ALTER DATABASE harborops CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Grant the app user permission to create/drop the test database
-- (required by pytest-django's test runner)
GRANT ALL PRIVILEGES ON `test_harborops`.* TO 'harborops'@'%';
FLUSH PRIVILEGES;
