declare module 'node-cron' {
  interface ScheduledTask {
    start: () => void;
    stop: () => void;
    destroy: () => void;
    getStatus: () => 'scheduled' | 'running' | 'stopped';
  }

  interface ScheduleOptions {
    scheduled?: boolean;
    timezone?: string;
  }

  function schedule(expression: string, func: () => void, options?: ScheduleOptions): ScheduledTask;
  function validate(expression: string): boolean;

  export { schedule, validate };
  export default schedule;
}