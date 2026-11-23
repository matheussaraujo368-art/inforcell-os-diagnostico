-- Assistente de bancada: conversas livres do técnico com a IA.
-- CreateTable
CREATE TABLE `conversas_bancada` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `titulo` VARCHAR(120) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `conversas_bancada_usuarioId_updatedAt_idx`(`usuarioId`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mensagens_bancada` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversaId` INTEGER NOT NULL,
    `autor` ENUM('TECNICO', 'IA') NOT NULL,
    `conteudo` TEXT NOT NULL,
    `anexos` JSON NULL,
    `passos` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `conversas_bancada` ADD CONSTRAINT `conversas_bancada_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversas_bancada` ADD CONSTRAINT `conversas_bancada_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mensagens_bancada` ADD CONSTRAINT `mensagens_bancada_conversaId_fkey` FOREIGN KEY (`conversaId`) REFERENCES `conversas_bancada`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
