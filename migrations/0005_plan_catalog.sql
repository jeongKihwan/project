PRAGMA foreign_keys = ON;

UPDATE plans SET name='Starter', credits=10, active=1 WHERE id='starter';
UPDATE plans SET name='Growth', credits=50, active=1 WHERE id='growth';
UPDATE plans SET name='Pro', credits=100, active=1 WHERE id='pro';
