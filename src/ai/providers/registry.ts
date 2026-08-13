import { AIProvider } from "../types";

export interface ProviderRegistration {
  readonly name: string;
  readonly provider: AIProvider;
  readonly priority: number;
}

export class ProviderRegistry {
  private readonly registrations =
    new Map<string, ProviderRegistration>();

  register(
    provider: AIProvider,
    priority = 100,
  ): void {
    const key = provider.name.toLowerCase();

    if (this.registrations.has(key)) {
      return;
    }

    this.registrations.set(key, {
      name: provider.name,
      provider,
      priority,
    });
  }

  unregister(name: string): boolean {
    return this.registrations.delete(
      name.toLowerCase(),
    );
  }

  get(name: string): AIProvider | undefined {
    return this.registrations.get(
      name.toLowerCase(),
    )?.provider;
  }

  getAll(): AIProvider[] {
    return [...this.registrations.values()]
      .sort(
        (a, b) =>
          a.priority - b.priority,
      )
      .map(
        (registration) =>
          registration.provider,
      );
  }

  getAvailable(): AIProvider[] {
    return this.getAll().filter(
      (provider) =>
        provider.isAvailable(),
    );
  }

  has(name: string): boolean {
    return this.registrations.has(
      name.toLowerCase(),
    );
  }

  clear(): void {
    this.registrations.clear();
  }

  get size(): number {
    return this.registrations.size;
  }
}
