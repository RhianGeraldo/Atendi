export interface EvoGoConfig {
  host: string;
  token: string;
}

export class EvoGoClient {
  private host: string;
  private token: string;

  constructor(config?: EvoGoConfig) {
    this.host = config?.host || import.meta.env.VITE_EVOGO_HOST || '';
    this.token = config?.token || import.meta.env.VITE_EVOGO_TOKEN || '';
  }

  private async request<T>(endpoint: string, options: RequestInit = {}, customApiKey?: string): Promise<T> {
    const url = `${this.host}${endpoint}`;
    
    const headers = {
      'Content-Type': 'application/json',
      'apikey': customApiKey || this.token,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`EvoGo API Error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  // --- Instances ---

  async createInstance(name: string, instanceToken: string, instanceId?: string) {
    return this.request('/instance/create', {
      method: 'POST',
      body: JSON.stringify({
        name,
        instanceId, // opcional
        token: instanceToken // O token individual gerado para a instância
      }),
    });
  }

  async getAllInstances() {
    return this.request('/instance/all');
  }

  async connectInstance(webhookUrl: string | undefined, instanceToken: string) {
    return this.request('/instance/connect', {
      method: 'POST',
      body: JSON.stringify({
        subscribe: ["ALL"],
        ...(webhookUrl && { webhookUrl })
      })
    }, instanceToken);
  }

  async getQrCode(instanceToken: string) {
    return this.request('/instance/qr', {}, instanceToken);
  }

  async getInstanceStatus(instanceToken: string) {
    return this.request('/instance/status', {}, instanceToken);
  }

  async logoutInstance(instanceToken: string) {
    return this.request('/instance/logout', { method: 'DELETE' }, instanceToken);
  }

  async deleteInstance(instanceId: string) {
    return this.request(`/instance/delete/${instanceId}`, { method: 'DELETE' }); // Usa admin token
  }

  // --- Advanced Settings ---
  
  async getAdvancedSettings(instanceId: string, instanceToken: string) {
    return this.request(`/instance/${instanceId}/advanced-settings`, {
      headers: {
        'apikey': instanceToken
      }
    });
  }

  async updateAdvancedSettings(instanceId: string, settings: any, instanceToken: string) {
    return this.request(`/instance/${instanceId}/advanced-settings`, {
      method: 'PUT',
      headers: {
        'apikey': instanceToken
      },
      body: JSON.stringify(settings)
    });
  }

  // --- Messaging & Chat ---

  async fetchProfilePictureUrl(number: string, instanceToken: string) {
    try {
      const result = await this.request('/chat/fetchProfilePictureUrl', {
        method: 'POST',
        body: JSON.stringify({ number })
      }, instanceToken) as any;
      return result?.profilePictureUrl || null;
    } catch (e) {
      console.warn("Failed to fetch profile picture for", number, e);
      return null;
    }
  }

  // --- Labels ---

  async getLabels(instanceToken: string) {
    try {
      const result = await this.request('/label/list', {
        method: 'GET'
      }, instanceToken) as any;
      return result || [];
    } catch (e) {
      console.warn("Failed to fetch labels", e);
      return [];
    }
  }

  async addLabelToContact(number: string, labelId: string, instanceToken: string) {
    return this.request('/label/add', {
      method: 'POST',
      body: JSON.stringify({ number, labelId })
    }, instanceToken);
  }

  async removeLabelFromContact(number: string, labelId: string, instanceToken: string) {
    return this.request('/label/remove', {
      method: 'DELETE',
      body: JSON.stringify({ number, labelId })
    }, instanceToken);
  }

  async sendText(number: string, text: string, instanceToken: string, delay = 1000) {
    return this.request('/send/text', {
      method: 'POST',
      body: JSON.stringify({
        number,
        text,
        delay
      }),
    }, instanceToken);
  }

  async sendMedia(number: string, url: string, caption: string, filename: string, instanceToken: string, type: 'image' | 'video' | 'audio' | 'document' = 'document', delay = 1000) {
    return this.request('/send/media', {
      method: 'POST',
      body: JSON.stringify({
        number,
        url,
        caption,
        filename,
        type,
        delay
      }),
    }, instanceToken);
  }
}

export const evogo = new EvoGoClient();
