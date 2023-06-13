module.exports = {
    apps: [
        {
            name: 'API',
            script: './index.js',
            env: {
                PORT : '4848',
                NODE_ENV : 'production',
                TZ : 'Asia/Kolkata',
                REACT_APP_DOMAIN : 'http://localhost:3000',
                REACT_APP_BASE_URL : 'http://localhost:3000',
                REACT_APP_API_URL : 'http://localhost:3000/api',
                JWT_SECRET : '^W5xD@qD6FTB9^T7wxF!3p7CAcsxW23tyCd1@jPOHB&Ib#NMtf',
                DB_HOSTNAME : '127.0.0.1',
                DB_USERNAME : 'root',
                DB_PASSWORD : '',
                DB_DATABASE : 'tracktail',
                DB_PORT : 3306,
                AWS_SES_REGION : 'ap-south-1',
                AWS_SES_USER : '',
                AWS_SES_ACCESS_KEY : '',
                AWS_SES_SECRET_KEY : '',
                DEFAULT_EMAIL : 'noreply@atl.tractail.in',
            },
            instances: 1,
            exec_mode: 'fork',
            watch: false,
            autorestart: false,
            error_file: './logs/error.api.log',
            out_file: './logs/out.api.log',
        }
    ]
};