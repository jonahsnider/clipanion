import {CommandBuilder, RunState}         from '../core';

import {BaseContext, CliContext, MiniCli} from './Cli';

export type Meta<Context extends BaseContext> = {
    definitions: ((command: CommandBuilder<CliContext<Context>>) => void)[];
    transformers: ((state: RunState, command: Command<Context>) => void)[];
};

export type Usage = {
    category?: string;
    description?: string;
    details?: string;
    examples?: [string, string][];
};

export type CommandClass<Context extends BaseContext = BaseContext> = {
    new(): Command<Context>;
    getMeta(prototype: Command<Context>): Meta<Context>;
    schema?: {validate: (object: any) => void};
    usage?: Usage;
};

export abstract class Command<Context extends BaseContext = BaseContext> {
    private static meta?: any;

    public static getMeta<Context extends BaseContext>(prototype: Command<Context>): Meta<Context> {
        const base = prototype.constructor as any;

        return base.meta = base.meta || {
            usage: [],
            definitions: [],
            transformers: [
                (state: RunState, command: Command<Context>) => {
                    for (const {name, value} of state.options) {
                        if (name === `-h` || name === `--help`) {
                            // @ts-ignore: The property is meant to have been defined by the child class
                            command.help = value;
                        }
                    }                
                },
            ],
        };
    }

    private static registerDefinition<Context extends BaseContext>(prototype: Command<Context>, definition: (command: CommandBuilder<CliContext<Context>>) => void) {
        this.getMeta(prototype).definitions.push(definition);
    }

    private static registerTransformer<Context extends BaseContext>(prototype: Command<Context>, transformer: (state: RunState, command: Command<Context>) => void) {
        this.getMeta(prototype).transformers.push(transformer);
    }

    /**
     * Wrap the specified command to be attached to the given path on the command line.
     * The first path thus attached will be considered the "main" one, and all others will be aliases.
     * @param path The command path.
     */
    static Path(...path: string[]) {
        return <Context extends BaseContext>(prototype: Command<Context>, propertyName: string) => {
            this.registerDefinition(prototype, command => {
                command.addPath(path);
            });
        };
    }

    /**
     * Register a boolean listener for the given option names. When Clipanion detects that this argument is present, the value will be set to false. The value won't be set unless the option is found, so you must remember to set it to an appropriate default value.
     * @param descriptor the option names.
     */
    static Boolean(descriptor: string) {
        return <Context extends BaseContext>(prototype: Command<Context>, propertyName: string) => {
            const optNames = descriptor.split(`,`);

            this.registerDefinition(prototype, command => {
                command.addOption({names: optNames, arity: 0});
            });

            this.registerTransformer(prototype, (state, command) => {
                for (const {name, value} of state.options) {
                    if (optNames.includes(name)) {
                        // @ts-ignore: The property is meant to have been defined by the child class
                        command[propertyName] = value;
                    }
                }
            });
        };
    }

    /**
     * Register a listener that looks for an option and its followup argument. When Clipanion detects that this argument is present, the value will be set to whatever follows the option in the input. The value won't be set unless the option is found, so you must remember to set it to an appropriate default value.
     * Note that all methods affecting positional arguments are evaluated in the definition order; don't mess with it (for example sorting your properties in ascendent order might have adverse results).
     * @param descriptor The option names.
     */
    static String(descriptor: string): PropertyDecorator;

    /**
     * Register a listener that looks for positional arguments. When Clipanion detects that an argument isn't an option, it will put it in this property and continue processing the rest of the command line.
     * Note that all methods affecting positional arguments are evaluated in the definition order; don't mess with it (for example sorting your properties in ascendent order might have adverse results).
     * @param descriptor Whether or not filling the positional argument is required for the command to be a valid selection.
     */
    static String(descriptor?: {required: boolean}): PropertyDecorator;

    static String(descriptor: string | {required: boolean} = {required: true}) {
        return <Context extends BaseContext>(prototype: Command<Context>, propertyName: string) => {
            if (typeof descriptor === `string`) {
                const optNames = descriptor.split(`,`);

                this.registerDefinition(prototype, command => {
                    command.addOption({names: optNames, arity: 1});
                });

                this.registerTransformer(prototype, (state, command) => {
                    for (const {name, value} of state.options) {
                        if (optNames.includes(name)) {
                            // @ts-ignore: The property is meant to have been defined by the child class
                            command[propertyName] = value;
                        }
                    }
                });
            } else {
                this.registerDefinition(prototype, command => {
                    command.addPositional({required: descriptor.required});
                });

                this.registerTransformer(prototype, (state, command) => {
                    if (state.positionals.length > 0) {
                        // @ts-ignore: The property is meant to have been defined by the child class
                        command[propertyName] = state.positionals.shift()!.value;
                    }
                });
            }
        }
    }


    /**
     * Register a listener that looks for an option and its followup argument. When Clipanion detects that this argument is present, the value will be pushed into the array represented in the property.
     */
    static Array(descriptor: string) {
        return <Context extends BaseContext>(prototype: Command<Context>, propertyName: string) => {
            const optNames = descriptor.split(`,`);

            this.registerDefinition(prototype, command => {
                command.addOption({names: optNames, arity: 1});
            });

            this.registerTransformer(prototype, (state, command) => {
                for (const {name, value} of state.options) {
                    if (optNames.includes(name)) {
                        // @ts-ignore: The property is meant to have been defined by the child class
                        command[propertyName] = command[propertyName] || [];
                        // @ts-ignore: The property is meant to have been defined by the child class
                        command[propertyName].push(value);
                    }
                }
            });
        };        
    }

    /**
     * Register a listener that takes all the positional arguments remaining and store them into the selected property.
     * Note that all methods affecting positional arguments are evaluated in the definition order; don't mess with it (for example sorting your properties in ascendent order might have adverse results).
     */
    static Rest(): PropertyDecorator;

    /**
     * Register a listener that takes all the positional arguments remaining and store them into the selected property.
     * Note that all methods affecting positional arguments are evaluated in the definition order; don't mess with it (for example sorting your properties in ascendent order might have adverse results).
     * @param opts.required The minimal number of arguments required for the command to be successful.
     */
    static Rest(opts: {required: number}): PropertyDecorator;

    static Rest({required = 0}: {required?: number} = {}) {
        return <Context extends BaseContext>(prototype: Command<Context>, propertyName: string) => {
            this.registerDefinition(prototype, command => {
                command.addRest({required});
            });

            this.registerTransformer(prototype, (state, command) => {
                // @ts-ignore: The property is meant to have been defined by the child class
                command[propertyName] = state.positionals.map(({value}) => value);
            });
        };
    }

    /**
     * Register a listener that takes all the arguments remaining (including options and such) and store them into the selected property.
     * Note that all methods affecting positional arguments are evaluated in the definition order; don't mess with it (for example sorting your properties in ascendent order might have adverse results).
     */
     static Proxy() {
        return <Context extends BaseContext>(prototype: Command<Context>, propertyName: string) => {
            this.registerDefinition(prototype, command => {
                command.addProxy();
            });

            this.registerTransformer(prototype, (state, command) => {
                // @ts-ignore: The property is meant to have been defined by the child class
                command[propertyName] = state.positionals.map(({value}) => value);
            });
        };
    }

    /**
     * Defines the usage information for the given command.
     * @param usage 
     */
    static Usage(usage: Usage) {
        return usage;
    }

    /**
     * Contains the usage information for the command. If undefined, the command will be hidden from the general listing.
     */
    static usage?: Usage;

    /**
     * Standard command that'll get executed by `Cli#run` and `Cli#runExit`. Expected to return an exit code or nothing (which Clipanion will treat as if 0 had been returned).
     */
    abstract async execute(): Promise<number | void>;

    async validateAndExecute(): Promise<number> {
        const commandClass = this.constructor as CommandClass<Context>;
        const schema = commandClass.schema;
   
        if (typeof schema !== `undefined`) {
            try {
                await schema.validate(this);
            } catch (error) {
                if (error.name === `ValidationError`)
                    error.clipanion = {type: `usage`};
                throw error;
            }
        }

        const exitCode = await this.execute();
        if (typeof exitCode !== `undefined`) {
            return exitCode;
        } else {
            return 0;
        }
    }

    /**
     * Predefined that will be set to true if `-h,--help` has been used, in which case `Command#execute` shouldn't be called.
     */
    help: boolean = false;

    /**
     * Predefined variable that will be populated with a miniature API that can be used to query Clipanion and forward commands.
     */
    cli!: MiniCli<Context>;

    /**
     * Predefined variable that will be populated with the context of the application.
     */
    context!: Context;

    /**
     * The path that got used to access the command being executed.
     */
    path!: string[];
}