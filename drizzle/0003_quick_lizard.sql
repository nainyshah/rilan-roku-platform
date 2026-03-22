CREATE TABLE `webhook_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`channelId` int NOT NULL,
	`label` varchar(255) NOT NULL,
	`url` text NOT NULL,
	`secret` varchar(255),
	`events` json,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `webhook_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`webhookId` int NOT NULL,
	`event` varchar(100) NOT NULL,
	`statusCode` int,
	`responseBody` text,
	`attempt` int NOT NULL DEFAULT 1,
	`success` boolean NOT NULL DEFAULT false,
	`deliveredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhook_deliveries_id` PRIMARY KEY(`id`)
);
