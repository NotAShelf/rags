import GObject from 'gi://GObject';

/**
 * Centralized signal connection registry for preventing memory leaks.
 * Tracks all signal connections and provides bulk cleanup.
 */
export class SignalRegistry {
    private connections = new Map<GObject.Object, number[]>();

    /**
     * Register a signal connection for tracking
     */
    register(object: GObject.Object, connectionId: number): void {
        if (!this.connections.has(object)) {
            this.connections.set(object, []);
        }
        this.connections.get(object)!.push(connectionId);
    }

    /**
     * Disconnect all signals for a specific object
     */
    disconnect(object: GObject.Object): void {
        const ids = this.connections.get(object);
        if (!ids) return;

        // Disconnect in reverse order
        while (ids.length > 0) {
            const id = ids.pop()!;
            try {
                object.disconnect(id);
            } catch (error) {
                console.error(`Failed to disconnect signal ${id}:`, error);
            }
        }

        this.connections.delete(object);
    }

    /**
     * Disconnect all tracked signals (app shutdown)
     */
    disconnectAll(): void {
        for (const object of this.connections.keys()) {
            this.disconnect(object);
        }
        this.connections.clear();
    }

    /**
     * Get count of tracked connections (for debugging)
     */
    getConnectionCount(): number {
        let count = 0;
        for (const ids of this.connections.values()) {
            count += ids.length;
        }
        return count;
    }
}

/**
 * Global signal registry instance
 */
export const globalSignalRegistry = new SignalRegistry();
