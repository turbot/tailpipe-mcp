-- This comment includes a semicolon; it should be ignored
CREATE TABLE comment_test (value VARCHAR);
/* Block comment with a semicolon; still a comment */
INSERT INTO comment_test VALUES ('ok');
SELECT * FROM comment_test;

