INSTALL httpfs;
LOAD httpfs;
BEGIN TRANSACTION;
CREATE TABLE complex_table (id INTEGER);
INSERT INTO complex_table VALUES (1);
COMMIT;

