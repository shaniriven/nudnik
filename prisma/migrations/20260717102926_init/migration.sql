-- CreateTable
CREATE TABLE "processed_emails" (
    "gmail_message_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "processed_emails_pkey" PRIMARY KEY ("gmail_message_id")
);

-- CreateTable
CREATE TABLE "pending_transactions" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "transaction_type" TEXT NOT NULL,
    "gmail_message_id" TEXT,
    "receipt_date" TIMESTAMP(3),
    "received_date" TIMESTAMP(3) NOT NULL,
    "category" TEXT,
    "vendor_source" TEXT,
    "description" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "payment_method" TEXT,
    "notes" TEXT,
    "source_link" TEXT,
    "telegram_user_id" TEXT NOT NULL,
    "telegram_username" TEXT,
    "submitter_role" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "telegram_chat_id" TEXT,
    "telegram_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "pending_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_users" (
    "telegram_chat_id" TEXT NOT NULL,
    "telegram_username" TEXT,
    "role" TEXT NOT NULL,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_users_pkey" PRIMARY KEY ("telegram_chat_id")
);

-- AddForeignKey
ALTER TABLE "pending_transactions" ADD CONSTRAINT "pending_transactions_gmail_message_id_fkey" FOREIGN KEY ("gmail_message_id") REFERENCES "processed_emails"("gmail_message_id") ON DELETE SET NULL ON UPDATE CASCADE;
