export class OpsApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'OpsApiError';
    this.status = status;
  }
}
