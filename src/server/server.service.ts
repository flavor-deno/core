import { dirname } from '@std/path/mod.ts';
import { existsSync } from '@std/fs/mod.ts';
import { load as loadEnv } from '@std/dotenv/mod.ts';
import { parse as parseFlags } from '@std/flags/mod.ts';
import { serve } from '@std/http/mod.ts';
import { Constructor } from '../utils/interfaces/constructor.interface.ts';
import { env } from '../utils/functions/env.function.ts';
import { Module } from './interfaces/module.interface.ts';
import { Router } from '../router/router.service.ts';
import { runCommand } from '../utils/functions/run_command.function.ts';
import { ServerOptions } from './interfaces/server_options.interface.ts';
import { WebClientAlias } from './enums/web_client_alias.enum.ts';

export class Server {
  private readonly defaultHttpPort = 5050;

  private readonly modules: Constructor<Module>[] = [];

  private readonly router = new Router();

  constructor(options: ServerOptions) {
    this.modules = options.modules;
  }

  private checkSystemRequirements(): void {
    const minimumDenoVersion = '1.34.0';

    const satisfiesDenoVersion = Deno.version.deno
      .localeCompare(minimumDenoVersion, undefined, {
        numeric: true,
        sensitivity: 'base',
      });

    if (satisfiesDenoVersion === -1) {
      console.warn(
        `%cFlavor requires Deno version ${minimumDenoVersion} or higher %c[run 'deno upgrade' to update Deno]`,
        `color: orange`,
        'color: gray',
      );

      Deno.exit(1);
    }
  }

  private async serve(request: Request): Promise<Response> {
    const timerStart = performance.now();

    const response = await this.router.respond(request);

    const { status } = response;
    const { pathname } = new URL(request.url);

    let statusColor = 'blue';

    switch (true) {
      case status >= 100 && status < 200:
        statusColor = 'blue';

        break;

      case status >= 200 && status < 400:
        statusColor = 'lime';

        break;

      case status >= 400 && status < 500:
        statusColor = 'orange';

        break;

      case status >= 500 && status < 600:
        statusColor = 'red';

        break;
    }

    const { columns } = Deno.consoleSize();

    console.log(
      `\n%c[%c${response.status}%c] %cRequest: %c${pathname} %c${
        '.'.repeat(columns - pathname.length - 28)
      } [${(performance.now() - timerStart).toFixed(3)}ms]`,
      'color: lightgray',
      `color: ${statusColor}`,
      'color: lightgray',
      'color: blue',
      'color: white; font-weight: bold',
      'color: gray',
    );

    return response;
  }

  private setup(): void {
    for (const module of this.modules) {
      const moduleInstance = new module();

      for (const controller of moduleInstance.controllers ?? []) {
        this.router.registerController(controller);
      }
    }
  }

  private async setupDevelopmentEnvironment(): Promise<void> {
    const port = env('PORT') ?? 5050;
    const tempFilePath = '.temp/server';

    const flags = parseFlags(Deno.args, {
      boolean: ['open'],
      default: {
        open: false,
      },
    });

    const signals: Deno.Signal[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

    for (const signal of signals) {
      Deno.addSignalListener(signal, async () => {
        if (existsSync(dirname(tempFilePath))) {
          await Deno.remove(dirname(tempFilePath), {
            recursive: true,
          });
        }

        Deno.exit();
      });
    }

    if (flags.open && !existsSync(tempFilePath)) {
      if (!existsSync(dirname(tempFilePath))) {
        await Deno.mkdir(dirname(tempFilePath));
      }

      await Deno.writeTextFile(
        tempFilePath,
        'dev [1]',
      );

      runCommand(
        `${
          WebClientAlias[Deno.build.os as 'darwin' | 'linux' | 'win32'] ??
            'open'
        }`,
        [`http://localhost:${port}`],
      );
    }
  }

  public async start(
    port = env<number>('PORT', this.defaultHttpPort),
  ): Promise<void> {
    this.checkSystemRequirements();

    await loadEnv({
      allowEmptyValues: true,
      envPath: `${Deno.cwd()}/.env`,
      export: true,
    });

    if (env<boolean>('DEVELOPMENT')) {
      await this.setupDevelopmentEnvironment();
    }

    this.setup();

    await serve(async (request) => await this.serve(request), {
      port,
      hostname: env<string>('HOST') ?? 'localhost',
      onListen: () => {
        console.log(
          `\n%cHTTP server is running on ${
            env<boolean>('DEVELOPMENT') ? 'http://localhost:' : 'port '
          }${port} %c[${Deno.build.os === 'darwin' ? '⌃C' : 'Ctrl+C'} to quit]`,
          'color: mediumblue',
          'color: gray',
        );
      },
    });
  }
}
