/*
    Using:
    
    const logger = global.LoggerFactory.create('TestLogger');

    logger.info('Information - One: {}, Two: {}, Three: {}', 1, 2, 3);
    logger.warn('Warning - One: {}, Two: {}, Three: {}', 1, 2, 3);
    logger.error('Error - One: {}, Two: {}, Three: {}', 1, 2, 3);

    // It doesn't log anything
    global.LoggerFactory.debugEnabled = false; // false is a default value
    logger.debug('Debug false - One: {}, Two: {}, Three: {}', 1, 2, 3);

    // It logs
    global.LoggerFactory.debugEnabled = true;
    logger.debug('Debug true - One: {}, Two: {}, Three: {}', 1, 2, 3);
*/

global.LoggerFactory = (function() {
    const loggerFactory = {
        create: create,
        debugEnabled: false
    };

    return loggerFactory;

    function create(name) {

        return {
            info: info,
            debug: debug,
            warn: warn,
            error: error
        };

        function info() {
            const logString = createLogString('Info', arguments);
            log.info(logString);
        }

        function debug() {
            if(!loggerFactory.debugEnabled)
                return;

            const logString = createLogString('Debug', arguments);
            log.info(logString);
        }

        function warn() {
            const logString = createLogString('Warn', arguments);
            log.warn(logString);
        }

        function error() {
            const logString = createLogString('Error', arguments);
            log.error(logString);
        }

        function createLogString(level, originalArguments) {
            const allArgs = getArrayFromObject(originalArguments);
            if(allArgs.length === 0)
                return setPrefixName(level, '');

            const originalFormat = allArgs[0];
            const args = allArgs.slice(1);

            const argsLength = args.length;
            if(argsLength === 0)
                return setPrefixName(level, originalFormat);
            
            let result = '';
            const parts = originalFormat.split('{}');
            const partsLength = parts.length;
            for(let i = 0; i < partsLength - 1; i++)
            {
                result += parts[i];
                const argValue = i < argsLength ? args[i] : '{}';
                result += argValue;
            }

            result += parts[partsLength - 1];

            return setPrefixName(level, result);
        }

        function getArrayFromObject(obj) {
            const result = [];

            for(const key in obj)
                result.push(obj[key]);

            return result;
        }

        function setPrefixName(level, format) {
            return level + ': ' + name + ', ' + format;
        }
    }
})();