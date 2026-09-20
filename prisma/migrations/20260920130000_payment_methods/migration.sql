-- CreateTable
CREATE TABLE `payment_methods` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `provider` VARCHAR(40) NOT NULL,
    `environment` VARCHAR(20) NOT NULL DEFAULT 'sandbox',
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payment_methods_code_key`(`code`),
    INDEX `payment_methods_isActive_displayOrder_idx`(`isActive`, `displayOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed sandbox methods. Setting isActive to 0 disables a method without a code change.
INSERT INTO `payment_methods` (`id`, `code`, `name`, `provider`, `environment`, `isActive`, `displayOrder`, `updatedAt`)
VALUES
    (UUID(), 'momo', 'MoMo', 'momo', 'sandbox', true, 10, CURRENT_TIMESTAMP(3)),
    (UUID(), 'zalopay', 'ZaloPay', 'zalopay', 'sandbox', true, 20, CURRENT_TIMESTAMP(3)),
    (UUID(), 'vietqr', 'VietQR', 'vietqr', 'sandbox', true, 30, CURRENT_TIMESTAMP(3));

-- Add the selected method to new payment transactions while preserving old rows.
ALTER TABLE `payment_transactions`
    ADD COLUMN `paymentMethodId` CHAR(36) NULL,
    ADD INDEX `payment_transactions_paymentMethodId_idx`(`paymentMethodId`),
    ADD CONSTRAINT `payment_transactions_paymentMethodId_fkey`
        FOREIGN KEY (`paymentMethodId`) REFERENCES `payment_methods`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

