-- Chave de IA (Anthropic) e modelo por empresa. A chave é gravada criptografada pela aplicação.
ALTER TABLE `empresas` ADD COLUMN `iaChaveCifrada` TEXT NULL,
    ADD COLUMN `iaModelo` VARCHAR(80) NULL;
