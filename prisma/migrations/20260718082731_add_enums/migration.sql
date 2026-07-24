/*
  Warnings:

  - The `payment_method` column on the `pending_transactions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `pending_transactions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `role` on the `bot_users` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `source` on the `pending_transactions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `transaction_type` on the `pending_transactions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `submitter_role` on the `pending_transactions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `status` on the `processed_emails` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "ProcessedEmailStatus" AS ENUM ('extracted', 'skipped_no_transaction', 'extraction_failed');

-- CreateEnum
CREATE TYPE "TransactionSource" AS ENUM ('Email', 'Telegram Photo', 'Manual', 'Z-Report');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('Income', 'Expense');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('Credit Card', 'Bank Transfer', 'Cash', 'Bit', 'PayPal', 'Other');

-- CreateEnum
CREATE TYPE "PendingTransactionStatus" AS ENUM ('pending', 'confirmed', 'rejected', 'editing');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('Admin', 'Worker');

-- AlterTable
ALTER TABLE "bot_users" DROP COLUMN "role",
ADD COLUMN     "role" "Role" NOT NULL;

-- AlterTable
ALTER TABLE "pending_transactions" DROP COLUMN "source",
ADD COLUMN     "source" "TransactionSource" NOT NULL,
DROP COLUMN "transaction_type",
ADD COLUMN     "transaction_type" "TransactionType" NOT NULL,
DROP COLUMN "payment_method",
ADD COLUMN     "payment_method" "PaymentMethod",
DROP COLUMN "submitter_role",
ADD COLUMN     "submitter_role" "Role" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "PendingTransactionStatus" NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE "processed_emails" DROP COLUMN "status",
ADD COLUMN     "status" "ProcessedEmailStatus" NOT NULL;
