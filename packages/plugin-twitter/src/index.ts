import { ClientInstance, logger, stringToUuid, UUID, type Client, type IAgentRuntime, type Plugin } from "@elizaos/core";
import reply from "./actions/reply.ts";
import { ClientBase } from "./base.ts";
import { TWITTER_CLIENT_NAME } from "./constants.ts";
import { type TwitterConfig } from "./environment.ts";
import { TwitterInteractionClient } from "./interactions.ts";
import { TwitterPostClient } from "./post.ts";
import { TwitterSpaceClient } from "./spaces.ts";
import { ITwitterClient } from "./types.ts";

/**
 * A manager that orchestrates all specialized Twitter logic:
 * - client: base operations (login, timeline caching, etc.)
 * - post: autonomous posting logic
 * - search: searching tweets / replying logic
 * - interaction: handling mentions, replies
 * - space: launching and managing Twitter Spaces (optional)
 */
export class TwitterClient implements ITwitterClient {
    name: string = "twitter";
    client: ClientBase;
    post: TwitterPostClient;
    interaction: TwitterInteractionClient;
    space?: TwitterSpaceClient;

    constructor(runtime: IAgentRuntime) {
        console.log("*** CONSTRUCTING TWITTER CLIENT");
        console.log("*** RUNTIME", runtime);
        // Pass twitterConfig to the base client
        this.client = new ClientBase(runtime);

        // Posting logic
        this.post = new TwitterPostClient(this.client, runtime);

        // Mentions and interactions
        this.interaction = new TwitterInteractionClient(this.client, runtime);

        // Optional Spaces logic (enabled if TWITTER_SPACES_ENABLE is true)
        if (runtime.getSetting("TWITTER_SPACES_ENABLE") === true) {
            this.space = new TwitterSpaceClient(this.client, runtime);
        }
    }

    async stop() {
        logger.warn("Twitter client does not support stopping yet");
    }
}

export class TwitterClientManager {
    private static instance: TwitterClientManager;
    private clients: Map<string, TwitterClient> = new Map();

    static getInstance(): TwitterClientManager {
        if (!TwitterClientManager.instance) {
            TwitterClientManager.instance = new TwitterClientManager();
        }
        return TwitterClientManager.instance;
    }

    async createClient(runtime: IAgentRuntime, clientId: string): Promise<TwitterClient> {
        console.log("Creating client", clientId);
        if (runtime.getSetting("TWITTER_2FA_SECRET") === null) {
            runtime.setSetting("TWITTER_2FA_SECRET", undefined, false);
        }
        try {
            // Check if client already exists
            const existingClient = this.getClient(clientId, runtime.agentId);
            if (existingClient) {
                logger.info(`Twitter client already exists for ${clientId}`);
                return existingClient;
            }
            console.log("*** CREATING NEW CLIENT");
            // Create new client instance
            const client = new TwitterClient(runtime);
            console.log("*** CLIENT", client);
            // Initialize the client
            await client.client.init();
            console.log("*** CLIENT INITIALIZED");
            // Store the client instance
            this.clients.set(this.getClientKey(clientId, runtime.agentId), client);
            console.log("*** CLIENT STORED");
            logger.info(`Created Twitter client for ${clientId}`);
            return client;

        } catch (error) {
            logger.error(`Failed to create Twitter client for ${clientId}:`, error);
            throw error;
        }
    }

    getClient(clientId: string, agentId: UUID): TwitterClient | undefined {
        return this.clients.get(this.getClientKey(clientId, agentId));
    }

    async stopClient(clientId: string, agentId: UUID): Promise<void> {
        const key = this.getClientKey(clientId, agentId);
        const client = this.clients.get(key);
        if (client) {
            try {
                await client.stop();
                this.clients.delete(key);
                logger.info(`Stopped Twitter client for ${clientId}`);
            } catch (error) {
                logger.error(`Error stopping Twitter client for ${clientId}:`, error);
            }
        }
    }

    async stopAllClients(): Promise<void> {
        for (const [key, client] of this.clients.entries()) {
            try {
                await client.stop();
                this.clients.delete(key);
            } catch (error) {
                logger.error(`Error stopping Twitter client ${key}:`, error);
            }
        }
    }

    private getClientKey(clientId: string, agentId: UUID): string {
        return `${clientId}-${agentId}`;
    }
}

const TwitterClientInterface: Client = {
    name: TWITTER_CLIENT_NAME,
    start: async (runtime: IAgentRuntime) => {
        console.log("*** STARTING TWITTER CLIENT");
        console.log("*** RUNTIME", runtime);
        const manager = TwitterClientManager.getInstance();
        
        // Check for character-level Twitter credentials
        const twitterConfig: Partial<TwitterConfig> = {
            TWITTER_USERNAME: (runtime.getSetting("TWITTER_USERNAME") as string) || runtime.character.settings?.TWITTER_USERNAME || runtime.character.secrets?.TWITTER_USERNAME,
            TWITTER_PASSWORD: (runtime.getSetting("TWITTER_PASSWORD") as string) || runtime.character.settings?.TWITTER_PASSWORD || runtime.character.secrets?.TWITTER_PASSWORD,
            TWITTER_EMAIL: (runtime.getSetting("TWITTER_EMAIL") as string) || runtime.character.settings?.TWITTER_EMAIL || runtime.character.secrets?.TWITTER_EMAIL,
            TWITTER_2FA_SECRET: (runtime.getSetting("TWITTER_2FA_SECRET") as string) || runtime.character.settings?.TWITTER_2FA_SECRET || runtime.character.secrets?.TWITTER_2FA_SECRET,
        };

        console.log("*** TWITTER CONFIG", twitterConfig);

        // Filter out undefined values
        const config = Object.fromEntries(
            Object.entries(twitterConfig).filter(([_, v]) => v !== undefined)
        ) as TwitterConfig;

        // If we have enough settings to create a client, do so
        try {
            if (config.TWITTER_USERNAME && (
                // Basic auth
                (config.TWITTER_PASSWORD && config.TWITTER_EMAIL)
                // ||
                // // API auth
                // (config.TWITTER_API_KEY && config.TWITTER_API_SECRET && 
                //  config.TWITTER_ACCESS_TOKEN && config.TWITTER_ACCESS_TOKEN_SECRET)
            )) {
                logger.info("Creating default Twitter client from character settings");
                console.log("*** CREATING DEFAULT CLIENT");
                await manager.createClient(runtime, stringToUuid("default"));
            }
        } catch (error) {
            logger.error("Failed to create default Twitter client:", error);
        }

        const clientInstance: ClientInstance = {
            async stop() {
                await manager.stopAllClients();
            }
        };
        return clientInstance;
    }
};

const twitterPlugin: Plugin = {
    name: "twitter",
    description: "Twitter client with per-server instance management",
    clients: [TwitterClientInterface],
    actions: [reply]
};

export default twitterPlugin;
