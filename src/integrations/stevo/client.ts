export interface StevoConfig {
  host: string;
  token: string;
}

export class StevoClient {
  private host: string;
  private token: string;

  constructor(config?: StevoConfig) {
    this.host = config?.host || import.meta.env.VITE_STEVO_HOST || '';
    this.token = config?.token || import.meta.env.VITE_STEVO_TOKEN || '';
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
      let errorMessage = `Stevo API Error: ${response.status} - ${errorText}`;
      try {
        const json = JSON.parse(errorText);
        if (json.error) errorMessage = json.error;
        else if (json.message) errorMessage = json.message;
      } catch (e) {
        // ignore
      }
      throw new Error(errorMessage);
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

  async getPairingCode(phone: string, instanceToken: string) {
    return this.request('/instance/pair', {
      method: 'POST',
      body: JSON.stringify({ phone })
    }, instanceToken);
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
        'apikey': instanceToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(settings)
    });
  }

  // --- Messaging & Chat ---

  async fetchProfilePictureUrl(number: string, instanceToken: string) {
    try {
      const result = await this.request('/user/avatar', {
        method: 'POST',
        body: JSON.stringify({ number, preview: false })
      }, instanceToken) as any;
      return result?.url || result?.profilePictureUrl || null;
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
    return this.request('/label/chat', {
      method: 'POST',
      body: JSON.stringify({ jid: `${number}@s.whatsapp.net`, labelId })
    }, instanceToken);
  }

  async removeLabelFromContact(number: string, labelId: string, instanceToken: string) {
    return this.request('/unlabel/chat', {
      method: 'POST',
      body: JSON.stringify({ jid: `${number}@s.whatsapp.net`, labelId })
    }, instanceToken);
  }

  async sendText(number: string, text: string, instanceToken: string, delay = 1000, quoted?: { messageId: string, participant: string }) {
    return this.request('/send/text', {
      method: 'POST',
      body: JSON.stringify({
        number,
        text,
        delay,
        ...(quoted && { quoted })
      }),
    }, instanceToken);
  }

  async sendMedia(number: string, url: string, caption: string, filename: string, instanceToken: string, type: 'image' | 'video' | 'audio' | 'document' = 'document', delay = 1000, quoted?: { messageId: string, participant: string }) {
    const body: any = {
      number,
      url,
      caption,
      type,
      delay,
      ...(quoted && { quoted })
    };

    if (type !== 'image') {
      body.filename = filename;
    } else {
      body.mimetype = 'image/jpeg';
    }

    return this.request('/send/media', {
      method: 'POST',
      body: JSON.stringify(body),
    }, instanceToken);
  }
}

export const stevo = new StevoClient();
