ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordChangedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `totpSecret` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `totpEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `magicLinkToken` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `magicLinkExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `mustChangePassword` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` boolean DEFAULT true NOT NULL;