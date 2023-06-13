const express = require('express');
const app = express();
const cors = require('cors');
const mysql = require('mysql');
const fs = require('fs');
const bcrypt = require('bcryptjs');
var jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const PDFDocument  = require('pdfkit');
const multer = require('multer');
const csv = require('fast-csv');
const SVGtoPDF = require('svg-to-pdfkit');
const osu = require('node-os-utils');

//  Get env variables
require('dotenv').config();

//  Middleware
app.use(express.json());

//  Connect to DB
// app.use( cors() );
app.use(
    cors({
      origin: 
        "https://track01.vercel.app",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    })
  );

const con = mysql.createConnection({
    host        : process.env.DB_HOSTNAME,
    user        : process.env.DB_USERNAME,
    password    : process.env.DB_PASSWORD,
    database    : process.env.DB_DATABASE,
});

con.connect((err)=>{
    if(err){
        console.error('Unable to connect to database...', err );
        return;
    }
    console.log('MySQL DB connection established...');
});

app.get('/api', (req, res) => res.json({ message : 'Welcome to the API Home Page!', status : 'success' }));

app.get('/api/admin/home', async (req,res) => {
    let response = { status: 'error', data: [] };

    response.data[0] = {
        'link'          : '',
        'title'         : 'Used Space',
        'description'   : '',
        'value'         : 0,
    };

    response.data[1] = {
        'link'          : '',
        'title'         : 'Free Space',
        'description'   : '',
        'value'         : 0,
    };

    response.data[2] = {
        'link'          : '/admin/jobs',
        'title'         : 'Total Jobs',
        'description'   : '',
        'value'         : 0,
    };

    response.data[3] = {
        'link'          : '/admin/codes',
        'title'         : 'Total Codes',
        'description'   : '',
        'value'         : 0,
    };

    response.data[4] = {
        'link'          : '/admin/codes?status=1',
        'title'         : 'Success',
        'description'   : '',
        'value'         : 0,
    };

    response.data[5] = {
        'link'          : '/admin/codes?status=2',
        'title'         : 'Errors',
        'description'   : '',
        'value'         : 0,
    };

    osu.drive.info()
    .then(info => {
        response.data[ 0 ].value = ( info.usedPercentage || 0 ) + '%';
        response.data[ 1 ].value = ( info.freePercentage || 0 ) + '%';
    });

    await new Promise(function(resolve, reject) {
        con.query('SELECT COUNT(`jobId`) AS count FROM `jobs` WHERE `status` > -1;', (err,rows) => {
            if( err ) {
                return reject(err);
            }else {
                resolve(rows);
            }
        });
    }).then( ( rows ) => {
        response.data[ 2 ].value = ( rows[0].count || 0 );
    }).catch( ( error ) => {
        response.error = error;
    });

    await new Promise(function(resolve, reject) {
        con.query('SELECT `status`, count(*) as `count` from `codes` GROUP BY `status`;', (err, rows) => {
            if( err ) {
                return reject(err);
            }else {
                resolve(rows);
            }
        });
    }).then( ( rows ) => {
        let drafts = 0, 
        errors = 0,
        scanned = 0;
        for( row of rows ) {
            if( row.status === 1 ) {
                scanned = row.count;
            }else if( row.status === 2 ) {
                errors = row.count;
            }else {
                drafts = row.count;
            }
        }
        response.code = rows[0].NumberOfProducts;
        response.data[ 3 ].value = ( drafts + scanned + errors );
        response.data[ 4 ].value = scanned;
        response.data[ 5 ].value = errors;
    }).catch( ( error ) => {
        response.error = error;
    });

    return res.json(response);
});

app.post('/api/login', (req, res) => {
    var email = req.body.email;
    var password = req.body.password;

    let response = { data:[], status : 'error', message : '' };
    if (email && password) {
        con.query( `SELECT * FROM users WHERE email = ${con.escape(email)} OR mobile = ${con.escape(email)};`,
        (err, result) => {
            if (err) {
                response.message =  err;
                return res.json(response);
            }
            if (!result.length) {
                response.message =  'Email  is incorrect!';
                return res.json(response);
            }
            bcrypt.compare(
                password,
                result[0].password,
                (bErr, bResult) => {
                    if(bErr){
                        response.message =  bErr;
                        return res.json(response);
                    }
                    if (result) {
                        const token = jwt.sign({userId:result.userId},process.env.JWT_SECRET,{ expiresIn: '1h' });
                        result[0].token = token;
                        response.data = result;
                        response.message =  'Logged in!';
                        response.status =  'success';
                        return res.json(response);
                    }
                   
                    
                }
            );
        });
    }else{
        response.message =  'Please enter email and password!';
        return res.json(response);
    }
});

app.get('/api/admin/home', async (req,res) => {
    let page = parseInt(req.query.page) || 0,
    limit = parseInt(req.query.limit) || 100;
    pageOffset = 0;
    if (page > 1) {
        pageOffset = (page - 1) * limit;
    } else {
        page = 1;
    }

    let response = { status: 'error', data: [], count: 0, page: page, pages: 1, total: 0, skip: pageOffset };
    await new Promise(function(resolve, reject) {
        con.query(`SELECT * FROM codes`, (err,rows) => {
            if( err ) {
                return reject(err);
            }else {
                resolve(rows);
            }
        });
    }).then( ( rows ) => {
        response.total = rows.length;
    }).catch( ( error ) => {
        response.error = error;
    });
    
    let query = `SELECT * FROM codes  WHERE jobId=${req.query.jobId} AND status = ${req.query.status} LIMIT ${limit} OFFSET ${pageOffset}`;

    await new Promise(function(resolve, reject) {
        con.query(query, (err,rows) => {
            if( err ) {
                return reject(err);
            }else {
                resolve(rows);
            }
        });
    }).then( ( rows ) => {
        response.status = 'success';
        response.data = rows;
        response.count = response.data.length;
    }).catch( ( error ) => {
        response.error = error;
    });

    return res.json(response);
});

app.post('/api/loginnew', (req, res) => {
    var email = ( req.body.email || '' );
    var password = ( req.body.password || '' );

    let response = { data:[], status : 'error', message : '' };
    if (email && password) {
        con.query( "SELECT `userId`,`password` FROM `users` WHERE `email` = '${con.escape(email)}' OR `mobile` = '${con.escape(email)}' LIMIT 0,1;",
        (err, result) => {
            if ( result.length && !err ) {
                bcrypt.compare( password, result[0].password, (bErr, bResult) => {
                    if(bErr){
                        response.message = bErr;
                    }else if (result) {
                        const token = jwt.sign({ userId: result.userId }, process.env.JWT_SECRET, { expiresIn: '1m' });
                        result[0].token = token;
                        response.data = result;
                        response.message =  'Logged in!';
                        response.status = 'success';
                    }
                });
            }else if (err) {
                console.log(err);
                response.message = 'Unable to login. ERROR: ' + err.code;
            }else {
                response.message = 'Email is incorrect!';
            }
        });
    }else {
        response.message = 'Please enter email and password!';
    }

    return res.json(response);
});

app.get('/api/jobs', async (req,res) => {
    let page = parseInt(req.query.page) || 0,
    limit = parseInt(req.query.limit) || 50;
    pageOffset = 0;
    if (page > 1) {
        pageOffset = (page - 1) * limit;
    } else {
        page = 1;
    }

    let response = { status: 'error', data: [], count: 0, page: page, pages: 1, total: 0, skip: pageOffset };
    let query1 = 'SELECT COUNT(`jobId`) AS `NumberOfProducts` FROM `jobs` WHERE `status` > -1';
    if( req.query.account ){
        query1 += ' AND `accountId` = '+ req.query.account
    }

    await new Promise(function(resolve, reject) {
        con.query(query1, (err,rows) => {
            if( err ) {
                return reject(err);
            }else {
                resolve(rows);
            }
        });
    }).then( ( rows ) => {
        response.status = 'success';
        response.total = rows[0].NumberOfProducts;
    }).catch( ( error ) => {
        response.error = error;
    });
    
     
    let query = 'SELECT * FROM `jobs` WHERE `status` > -1';
    if( req.query.account ){
        query += ' AND `accountId` = '+ req.query.account
    }
    if( req.query.search ) {
        query += ' AND `batch` LIKE "%' + req.query.search + '%"';
    }
    query += ' ORDER BY `created` DESC LIMIT ' + limit + ' OFFSET ' + pageOffset + ';';
    await new Promise(function(resolve, reject) {
        con.query(query, (err,rows) => {
            if( err ) {
                return reject(err);
            }else {
                resolve(rows);
            }
        });
    }).then( ( rows ) => {
        response.status = 'success';
        rows.forEach(row => {
            row.pending = row.total - row.scanned;
            response.data.push( row );
        });
        response.count = response.data.length;
    }).catch( ( error ) => {
        response.error = error;
    });

    return res.json(response);
});

app.get('/api/job', async (req,res) => {
    let page = parseInt(req.query.page) || 0,
    limit = parseInt(req.query.limit) || 100;
    pageOffset = 0;
    if (page > 1) {
        pageOffset = (page - 1) * limit;
    } else {
        page = 1;
    }

    let response = { status: 'error', data: [], count: 0, page: page, pages: 1, total: 0, skip: pageOffset };

    await new Promise(function(resolve, reject) {
        con.query("SELECT * FROM `jobs` WHERE `jobId` = " + req.query.jobId + " LIMIT 0,1;", (err,rows) => {
            if( err ) {
                return reject(err);
            }else {
                resolve(rows);
            }
        });
    }).then( ( rows ) => {
        response.status = 'success';
        response.data = rows[0];
        response.data.printed = response.data.total - response.data.scanned;
    }).catch( ( error ) => {
        response.error = error;
    });

    let query = 'SELECT * FROM `metadata` WHERE `metaId` = '+ response.data.templateId;
    await new Promise(function(resolve, reject) {
        con.query(query, (err1,row) => {
            if( err1 ) {
                return reject(err1);
            }else {
                resolve(row);
            }
        });
    }).then( ( row ) => {
        response.status = 'success';
        response.data.template = JSON.parse( row[0].meta_value );
        // response.template = response.data.template;

        response.data.data_file_url = '';
        if( response.data.data_file ) {
            response.data.data_file_url = process.env.REACT_APP_BASE_URL + '/assets/uploads/' + response.data.data_file;
        }
    }).catch( ( error ) => {
        response.error = error;
    });

    return res.json(response);
});

async function getCodes( req ) {
    let page = parseInt(req.page) || 0,
    limit = parseInt(req.limit) || 100;
    pageOffset = 0;
    if (page > 1) {
        pageOffset = (page - 1) * limit;
    } else {
        page = 1;
    }

    let response = { status: 'error', data: [], count: 0, page: page, pages: 1, total: 0, skip: pageOffset };

    //  Get codes
    let query = 'SELECT SQL_CALC_FOUND_ROWS * FROM codes WHERE 1=1';

    if( [ undefined, null, false, '' ].indexOf( req.accountId ) === -1 ) {
        query += ' AND `accountId` = "' + req.accountId + '"';
    }

    if( [ undefined, null, false, '' ].indexOf( req.jobId ) === -1 ) {
        query += ' AND `jobId` = "' + req.jobId + '"';
    }

    if( [ undefined, null, false, '' ].indexOf( req.status ) === -1 ) {
        query += ' AND `status` = "' + req.status + '"';
    }

    //  Order by
    query += ' ORDER BY `codeId` ASC';
    
    //  Limit
    if( [ undefined, null, false, '' ].indexOf( req.start ) === -1 ) {
        query += ' LIMIT ' + req.start + ',' + limit + ';';
    }

    if( [ undefined, null, false, '' ].indexOf( req.code ) === -1 ) {
        query += ' LIMIT ' + limit + ' OFFSET ' + pageOffset + ';';

    }
    await new Promise(function(resolve, reject) {
        con.query( 'SELECT FOUND_ROWS() AS `total`;',(err1,result)=>{
            response.total = ( result[0].total || 0 );            
        });
        con.query(query, (err,rows) => {
            if( err ) {
                return reject(err);
            }else {
                resolve({ rows : rows, total : response.total });
            }
        });
        
    }).then( ( resp ) => {
        response.status = 'success';
        response.data = resp.rows;
        response.count = response.data.length;
    }).catch( ( error ) => {
        response.error = error;
    });

    return response;
}

app.get('/api/admin/codes', async (req,res) => {
    const response = await getCodes(req.query);
    return res.json(response);
});

app.get('/api/admin/settings', async (req,res) => {
    let page = parseInt(req.query.page) || 0,
    limit = parseInt(req.query.limit) || 100;
    pageOffset = 0;
    if (page > 1) {
        pageOffset = (page - 1) * limit;
    } else {
        page = 1;
    }

    let response = { status: 'error', data: [], count: 0, page: page, pages: 1, total: 0, skip: pageOffset };
    response.templates = [];
    response.accounts = [];

    let query = 'SELECT * FROM `metadata`;';
    await new Promise(function(resolve, reject) {
        con.query(query, (err,rows) => {
            if( err ) {
                return reject(err);
            }else {
                resolve(rows);
            }
        });
    }).then( ( rows ) => {
        response.status = 'success';
        rows.forEach(val => {
            val.meta_value = JSON.parse( val.meta_value );
            if( val.module === 'account' ){
                response.accounts.push(val);  
            }else if( val.module === 'template' ){
                response.templates.push(val);
            }
        });
    }).catch( ( error ) => {
        response.error = error;
    });
    return res.json(response);
});

app.get('/api/admin/template', async (req,res) => {

    let response = { status: 'error', data: [] };
    let query = 'SELECT * FROM `metadata` WHERE metaId='+req.query.metaId;
    await new Promise(function(resolve, reject) {
        con.query(query, (err,rows) => {
            if( err ) {
                return reject(err);
            }else {
                resolve(rows);
            }
        });
    }).then( ( rows ) => {
        response.status = 'success';
        response.data = JSON.parse( rows[0].meta_value );

    }).catch( ( error ) => {
        response.error = error;
    });
    return res.json(response);
});

const upload = multer({
    storage : multer.diskStorage({
        destination: (req, file, callBack) => {
            callBack(null, '../assets/uploads')    
        },
        filename: (req, file, callBack) => {
            callBack(null, file.fieldname + '-' + Date.now() +'.csv')
        }
    })
}).single('file');

app.post('/api/job', upload, async(req,res)=>{
    let response = { status: 'error', message : '', data: [] };

    if( req.file && req.file.filename ) {
        req.body.data_file = req.file.filename;
    }else if( ! req.body.data_file) {
        req.body.data_file = '';
    }

    let query = '',
    action = 'add';
    if( req.body && [ undefined, null, false, 0, '' ].indexOf( req.body.jobId ) === -1 ) {
        action = 'update';
        query = 'UPDATE `jobs` SET `accountId` = "' + parseInt(req.body.accountId) + '", `batch` = "' + req.body.batch + '", `templateId` = "' + parseInt(req.body.templateId) + '", `background` = "' + parseInt(req.body.background) + '", `status` = "' + parseInt(req.body.status) + '", `clone` = "' + parseInt(req.body.clone) + '", `total` = "' + parseInt(req.body.total) + '", `files` = "' + parseInt(req.body.files) + '" WHERE `jobId` = "' + req.body.jobId + '";';
    }else {
        query = `INSERT INTO jobs (accountId, templateId, batch, data_file, background, status, clone) VALUES ( ${parseInt(req.body.accountId)},${parseInt(req.body.templateId)},'${req.body.batch}','${req.body.data_file}',${parseInt(req.body.background)}, ${parseInt(req.body.status)}, ${parseInt(req.body.clone)} )`;
    }

    await new Promise(function(resolve, reject) {
        con.query(query, (err,row) => {
            if( err ) {
                return reject(err);
            }else {
                resolve(row);
            }
        });
    }).then( ( row ) => {
        response.status = 'success';
        response.data = req.body;
        if( action === 'update' ) {
            response.message = 'Job has been updated successfully';
            response.data.jobId = req.body.jobId;
        }else {
            response.message = 'Job has been created successfully';
            response.data.jobId = row.insertId;
        }
        
        response.data.file = req.file.path;
        response.data.meta_value = JSON.parse( req.body.meta_value );
        response.data.pages = Math.ceil( parseInt(response.data.meta_value.items ) * parseInt( response.data.meta_value.pages ) );
    }).catch( ( error ) => {
        response.error = error;
    });

    if( response.status === 'success' && req.file ) {
        const upload = await UploadCsvDataToMySQL( response.data );
        if( upload.status !== 'success' ) {
            response.status = 'error';
            response.message = upload.message || 'Unable to upload file';
            // response.upload = upload;
        }
        //  createPDF(response.data );
    }

    return res.json(response);
});

async function UploadCsvDataToMySQL(job){
    console.log( new Date().toLocaleString(), 'Starting data upload...' );
    let response = { status: 'error', message : '', data: [] };

    let csvData = [];
    await new Promise(function(resolve, reject) {
        let stream = fs.createReadStream(job.file);
        let csvStream =  csv.parse().on('data', function (data) {
            data.push(job.jobId);
            data.push(job.accountId);
            csvData.push(data);
        }).on('end', function () {
            // Remove Header ROW
            csvData.shift();  
            resolve(csvData);
        });
        stream.pipe(csvStream);
    }).then( ( rows ) => {
        csvData = rows;
    }).catch( ( error ) => {
        response.error = error;
    });

    const maxInsert = 3000;
    job.total = csvData.length;
    job.loops = Math.ceil( job.total / maxInsert );
    job.files = Math.ceil( job.total / job.pages );

    console.log( new Date().toLocaleString(), 'Inserting ' + job.total + ' rows...' );
    for (let i = 0; i < job.loops; i++) {
        // console.log( new Date().toLocaleString(), 'Inserting loop ', i);
        let query = 'INSERT INTO codes (vpa, merchant, closeQR, code, jobId, accountId) VALUES ?';
        await new Promise(function(resolve, reject) {
            let start = (i*maxInsert);
            let end = (start+maxInsert);
            con.query(query, [csvData.slice(start,end)], (err,row) => {
                if( err ) {
                    return reject(err);
                }else {
                    resolve(row);
                }
            });
        }).then( ( row ) => {
            response.data = [];
            let codeIdStart = row.insertId - 1;
            for( row of csvData ) {
                codeIdStart += 1;
                response.data.push({
                    codeId      : codeIdStart,
                    vpa         : row[0],
                    merchant    : row[1],
                    closeQR     : row[2],
                    code        : row[3],
                    jobId       : row[4],
                    accountId   : row[5],
                    status      : 0,
                });
            }
        }).catch( ( error ) => {
            console.log(error);
            response.error = error;
            response.message = error.sqlMessage;
        });
    }

    console.log( new Date().toLocaleString(), 'Inserted ' + response.data.length + ' rows...' );
    if( response.data.length ) {
        if( job.clone > 1 ) {
            job.files = Math.ceil( job.total / job.pages * job.clone );
        }
        
        let update = 'UPDATE `jobs` SET `total` = `total` + "' + job.total + '", `files` = `files` + "' + job.files + '" WHERE `jobId` = "' + job.jobId + '";';
        await new Promise(function(resolve, reject) {
            con.query(update, (err,rows) => {
                if( err ) {
                    return reject(err);
                }else {
                    resolve(rows);
                }
            });
        }).then( ( rows ) => {
            response.status = 'success';
        }).catch( ( error ) => {
            console.log(error);
        });
    }

    return response;
};

const generateQrImage = async text => {
    try {
        return await QRCode.toDataURL(text, {
            //  hex format (RGBA)
            color: {
                dark : '#000000ff',  // Black dots
                light: '#0000'      // Transparent background
            },
            errorCorrectionLevel: 'H',
            type: 'image/png',
            quality: 1,
            margin: 0,
            width: 2000,
        });
    } catch (err) {
        console.error(err)
    }
    return null;
}

const generateQR = async (text,size) => {
    try {
        return await QRCode.toString(text, {
            //  hex format (RGBA)
            color: {
                dark : '#000000ff', // Black dots
                light: '#0000'      // Transparent background
            },
            errorCorrectionLevel: 'M',
            type: 'svg',
            quality: 1,
            margin: 0,
            width: size || 240,
        });
    } catch (err) {
        console.error(err)
    }
    return null;
}

PDFDocument.prototype.addSVG = function(svg, x, y, options) {
    return SVGtoPDF(this, svg, x, y, options), this;
};

async function createPDF(req){
    console.log( new Date().toLocaleString(), 'Starting JOB #' + req.jobId);
    let response = { status: 'error', message : '', data: [] };

    //  Get Job details
    let job = {};
    await new Promise(function(resolve, reject) {
        con.query(`SELECT * FROM jobs WHERE jobId=${req.jobId}`, (err,rows) => {
            if( err ) {
                return reject( err );
            }else {
                resolve( rows );
            }
        });
    }).then( ( rows ) => {
        job = rows[0];
        job.codes = [];
        job.template = {};
        job.file = '../assets/uploads/' + job.data_file;
    }).catch( ( error ) => {
        console.error( error );
    });
    
    if( !job.templateId ){
        response.message = 'Template Id not found';
        response.error = 'templateId';
        return response;
    }

    await new Promise(function(resolve, reject) {
        con.query(`SELECT * FROM metadata WHERE metaId = ${job.templateId}`, (err,rows) => {
            if( err ) {
                return reject(err);
            }else {
                resolve(rows);
            }
        });
    }).then( ( rows ) => {
        job.template = JSON.parse(rows[0].meta_value);
        if( job.clone <= 1 ) {
            job.clone = 1;
        }

        //  Get svg template
        job.template.backgroundImage = fs.readFileSync( '../assets/templates/' + job.template.slug + '.svg' ).toString();
    }).catch( ( error ) => {
        response.error = error;
    });

    job.start = null;
    job.pageno = 0;
    if( req.pageNo && parseInt( req.pageNo ) > 0 ) {
        job.pageno = req.pageNo-1;
        job.start = Math.ceil( (job.template.items/job.clone)*job.template.pages*job.pageno );
    }

    if( req.total && parseInt( req.total ) > 0) {
        job.files = req.total;
        job.total = Math.ceil( (job.template.items/job.clone)*job.template.pages*req.total );
    }

    let result = await getCodes({
        jobId : job.jobId,
        limit : job.total,
        start : job.start,
        status: req.print
    });
    
    if( result.status === 'success' ) {
        job.codes = result.data;

        if( job.clone > 1 ) {
            job.codes = [];
            for( code of result.data ) {
                job.codes.push( code );
                job.codes.push( code );
            }
        }

        /*if( parseInt( req.print ) === 0 || parseInt( req.print ) === 2 ) {
            job.files = Math.ceil( job.codes.length / ( job.template.items*job.template.pages ) );
            await new Promise(function(resolve, reject) {
                 con.query('UPDATE `jobs` SET `error` = `error`+'+job.files+' WHERE `jobId` = ' + job.jobId + ';', (err,rows) => {
                    if( err) {
                        return reject(err);
                    }else {
                        resolve(rows);
                    }
                });
            }).then( ( rows ) => {
                response.status = 'success';
            }).catch( ( error ) => {
                console.log(error);
            });
        }*/

        //  Set current index of QR Code
        let count = 0;

        //  Loop files
        for( let i = job.pageno; i < job.files; i++ ) {
            console.log( new Date().toLocaleString(), 'Starting job #' + job.jobId + ' pdf #' + (i+1)+ ' creation...' );

            // Create a document
            const doc = new PDFDocument({ size: job.template.size, compress: true, pdfVersion: '1.7' });
           
            doc.fontSize(8);
            
            //  Pages per file
            for( let j = 0; j < job.template.pages; j++ ) {
                //  Create new page if more than one page is required
                if( j ) {
                    // console.log( new Date().toLocaleString(), 'Creating new page', j );
                    doc.addPage({ size: job.template.size });
                }

                //  Add page information
                if( job.background ) {
                    let bopts = {};
                    if( job.template.size && [ undefined, null, false, 0, '' ].indexOf( job.template.size[ 0 ] ) === -1 ) {
                        bopts.width = job.template.size[0];
                    }

                    if( job.template.size && [ undefined, null, false, 0, '' ].indexOf( job.template.size[ 1 ] ) === -1 ) {
                        bopts.height = job.template.size[1];
                    }

                    doc.addSVG( job.template.backgroundImage, 0, 0, bopts );
                }

                doc.save();
                doc.rotate( 90, { origin : [ 65, 100 ] });
                doc.font('../assets/fonts/Tondo_Corp_Rg.ttf').text(`Job : ${ job.jobId }    Page : ${j+1}    Sheet : ${i+1}    Batch : ${job.batch}`,5, -( job.template.size[0]-175 ) );
                doc.font('../assets/fonts/Tondo_Corp_Rg.ttf').text(`Job : ${ job.jobId }    Page : ${j+1}    Sheet : ${i+1}    Batch : ${job.batch}`,job.template.size[1]-230, -( job.template.size[0]-175 ) );
                doc.restore();
                doc.save();
                doc.rotate( 270, { origin : [ 65, 100 ] });
                doc.font('../assets/fonts/Tondo_Corp_Rg.ttf').text(`Job : ${ job.jobId }    Page : ${j+1}    Sheet : ${i+1}    Batch : ${job.batch}`,-50, 45 );
                doc.font('../assets/fonts/Tondo_Corp_Rg.ttf').text(`Job : ${ job.jobId }    Page : ${j+1}    Sheet : ${i+1}    Batch : ${job.batch}`,-job.template.size[1]+200, 45 );
                doc.restore();

                //  Codes per page
                for( let k = 0; k < job.template.items; k++ ) {
                    // console.log( new Date().toLocaleString(), 'Printing QR Code...', k );

                    //  Get code details
                    job.code = job.codes[ count ];

                    if( job.code === undefined ) {
                        continue;
                    }

                    //  Get text co-ordinates
                    if( [ undefined, null, false, 0, '' ].indexOf( job.template.coordinates[k].rotate ) === -1 ) {
                        job.template.coordinates[k].vx = job.template.coordinates[k].qx - 305;
                        job.template.coordinates[k].vy = job.template.coordinates[k].qy - 606;
                    }else {
                        job.template.coordinates[k].vx = job.template.coordinates[k].qx - 450;
                        job.template.coordinates[k].vy = job.template.coordinates[k].qy - 156;
                    }

                    //  Generate QR code
                    job.code.image = await generateQR( encodeURI( job.code.code ), job.template.image_size );

                    //  Save
                    doc.save();

                    //  Add QR Code to PDF
                    doc.addSVG( job.code.image, job.template.coordinates[k].qx, job.template.coordinates[k].qy, { width: job.template.coordinates[k].qw } );

                    //  Rotate PDF to add VPA
                    if( [ undefined, null, false, 0, '' ].indexOf( job.template.coordinates[k].rotate_text ) === -1 ) {
                        doc.rotate( job.template.coordinates[k].rotate_text, { origin : [ job.template.coordinates[k].qx-65, job.template.coordinates[k].qy-211 ] });
                    }

                    // Add VPA text
                    if( [ undefined, null, false, 0, '' ].indexOf( job.code.vpa ) === -1 ) {
                        doc.font('../assets/fonts/Tondo_Corp_Rg.ttf').text( job.code.vpa, job.template.coordinates[k].vx, job.template.coordinates[k].vy );
                        doc.restore();
                    }

                    //  Increment index
                    count++;
                }

                if( ( count + 1 ) >= job.total ) {
                    break
                }
            }

            //  Store document
            let path = `../assets/downloads/${job.batch}-${job.jobId}-${(i+1)}.pdf`;
            if( parseInt( req.print ) === 0 ) {
                path = `../assets/downloads/error${job.batch}-${job.jobId}-${(i+1)}.pdf`;
            }else if( parseInt( req.print ) === 2 ) {
                path = `../assets/downloads/error${job.batch}-${job.jobId}-${(i+1)}.pdf`;
            }

            const writeStream = fs.createWriteStream( path );
            doc.pipe( writeStream );

            writeStream.on('finish', function () {
                console.log( new Date().toLocaleString(), 'File has been created', path );
            });

            //  Finalize PDF file
            doc.end();
            console.log( new Date().toLocaleString(), 'Ending job #' + job.jobId + ' pdf #' + (i+1)+ ' creation...' );

            //  Wait for pdf to be generated
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    console.log( new Date().toLocaleString(), 'Ending JOB #' + req.jobId);
}

app.post('/api/job/start',(req,res) => {
    let response = { 
        data: [],
        status: 'success', 
        message: 'Starting job #' + req.body.jobId + ' pdf creation...'
    };

    //  Create pdf's
    createPDF( req.body );

    return res.json(response);
});

app.post('/api/admin/code/update',async(req,res)=>{
    let response = { status: 'error', message : '', data: [] };
    if ( ! req.body.code ) {
        response.errors = 'code';
        response.message = 'Please enter the QR Code';
        return res.json(response);
    }

    const dencoded = decodeURI(req.body.code);
    // const dencoded = req.body.code;
    await new Promise(function(resolve, reject) {
        let query = `SELECT * FROM codes WHERE code='${dencoded}' LIMIT 0,1`;
        con.query(query, (err,rows) => {
            if( err ) {
                return reject(err);
            }else {
                resolve(rows);
            }
        });
    }).then( ( rows ) => {
        response.status = 'success';
        response.data  = rows[0];
    }).catch( ( error ) => {
        console.log(error);
    });
    if( response.data ) {
        if( response.data.status === 1 || response.data.status === 2 ) {
            response.message = 'Code has been scanned already!';
        }else {
            await new Promise(function(resolve, reject) {
                con.query(`UPDATE codes SET status = ${req.body.status} WHERE code='${dencoded}';`, (err,rows) => {
                    if( err ) {
                        return reject(err);
                    }else {
                        resolve(rows);
                    }
                });
            }).then( ( rows ) => {
                response.status = 'success';
                if(rows){
                    if(parseInt( req.body.status ) === 1 ){
                        response.message = 'Code has been scanned successfully!';
                    }else{
                         response.message = 'Code has been updated successfully!';
                    }
                }
            }).catch( ( error ) => {
                console.log(error);
            });

            if(parseInt( req.body.status ) === 1 ){
                await new Promise(function(resolve, reject) {
                    con.query('UPDATE `jobs` SET `scanned` = `scanned`+1 WHERE `jobId` = ' + response.data.jobId + ';', (err,rows) => {
                        if( err) {
                            return reject(err);
                        }else {
                            resolve(rows);
                        }
                    });
                }).then( ( rows ) => {
                    response.status = 'success';
                }).catch( ( error ) => {
                    console.log(error);
                });
            }else{
                // if(parseInt( req.body.status ) === 2 ){
                    await new Promise(function(resolve, reject) {
                        con.query('UPDATE `jobs` SET `error` = `error`+1 WHERE `jobId` = ' + response.data.jobId + ';', (err,rows) => {
                            if( err) {
                                return reject(err);
                            }else {
                                resolve(rows);
                            }
                        });
                    }).then( ( rows ) => {
                        response.status = 'success';
                    }).catch( ( error ) => {
                        console.log(error);
                    });
                // }
            }
        }
    }else{
        response.message = 'Code does not found!';   
    }

    // if( response.data && response.data.status === 1 ) {
    //     response.message = 'Code has been scanned already!';
    // }else if( response.data && response.data.status === 0 ) {
    //     await new Promise(function(resolve, reject) {
    //         con.query(`UPDATE codes SET status = ${req.body.status} WHERE code='${dencoded}';`, (err,rows) => {
    //             if( err ) {
    //                 return reject(err);
    //             }else {
    //                 resolve(rows);
    //             }
    //         });
    //     }).then( ( rows ) => {
    //         response.status = 'success';
    //         if(rows){
    //             response.message = 'Code has been scanned successfully!';
    //         }
    //     }).catch( ( error ) => {
    //         console.log(error);
    //     });
    //     if(parseInt( req.body.status ) === 1 ){
    //         await new Promise(function(resolve, reject) {
    //             con.query('UPDATE `jobs` SET `scanned` = `scanned`+1 WHERE `jobId` = ' + response.data.jobId + ';', (err,rows) => {
    //                 if( err) {
    //                     return reject(err);
    //                 }else {
    //                     resolve(rows);
    //                 }
    //             });
    //         }).then( ( rows ) => {
    //             response.status = 'success';
    //         }).catch( ( error ) => {
    //             console.log(error);
    //         });
    //     }else{
    //         await new Promise(function(resolve, reject) {
    //             con.query('UPDATE `jobs` SET `error` = `error`+1 WHERE `jobId` = ' + response.data.jobId + ';', (err,rows) => {
    //                 if( err) {
    //                     return reject(err);
    //                 }else {
    //                     resolve(rows);
    //                 }
    //             });
    //         }).then( ( rows ) => {
    //             response.status = 'success';
    //         }).catch( ( error ) => {
    //             console.log(error);
    //         });
    //     }
    // }else if( response.data && response.data.status === 2 ) {
    //     await new Promise(function(resolve, reject) {
    //         con.query(`UPDATE codes SET status = ${req.body.status} WHERE code='${dencoded}';`, (err,rows) => {
    //             if( err ) {
    //                 return reject(err);
    //             }else {
    //                 resolve(rows);
    //             }
    //         });
    //     }).then( ( rows ) => {
    //         response.status = 'success';
    //         if(rows){
    //             // response.message = 'Code has been Error successfully!';
    //             response.message = 'Code has been scanned successfully!';
    //         }
    //     }).catch( ( error ) => {
    //         console.log(error);
    //     });
    //     if(parseInt( req.body.status ) === 1 ){
    //         await new Promise(function(resolve, reject) {
    //             con.query('UPDATE `jobs` SET `error` = `error`-1 WHERE `jobId` = ' + response.data.jobId + ';', (err,rows) => {
    //                 if( err) {
    //                     return reject(err);
    //                 }else {
    //                     resolve(rows);
    //                 }
    //             });
    //         }).then( ( rows ) => {
    //             response.status = 'success';
    //         }).catch( ( error ) => {
    //             console.log(error);
    //         });

    //         await new Promise(function(resolve, reject) {
    //             con.query('UPDATE `jobs` SET `scanned` = `scanned`+1 WHERE `jobId` = ' + response.data.jobId + ';', (err,rows) => {
    //                 if( err) {
    //                     return reject(err);
    //                 }else {
    //                     resolve(rows);
    //                 }
    //             });
    //         }).then( ( rows ) => {
    //             response.status = 'success';
    //         }).catch( ( error ) => {
    //             console.log(error);
    //         });
    //     }
       

    // }else{
    //     response.message = 'Unknown Code!';
    // }
    return res.json(response);
});

app.post('/api/job/update', async(req,res)=>{
    let response = { status: 'error', message : '', data: [] };
    let update = 'UPDATE `jobs` SET status = -1 WHERE jobId ='+req.body.jobId;
    await new Promise(function(resolve, reject) {
        con.query(update, (err,row) => {
            if( err ) {
                return reject(err);
            }else {
                resolve(row);
            }
        });
    }).then( ( row ) => {
        response.message = 'Job has been deteted successfully';
        response.status = 'success';
        response.data = req.body;
    }).catch( ( error ) => {
        response.error = error;
    });

    return res.json(response);
});

app.post('/api/job/file/delete', async(req,res)=>{
    let response = { status: 'error', message : '', data: [] };
    let filesCount = req.body.files;
    for (let i = 1; i <= filesCount; i++ ) {
        try {
            await fs.unlinkSync('../assets/downloads/' + req.body.batch + '-' + req.body.jobId + '-' + i + '.pdf')
            fs.unlinkSync('../assets/downloads/error' + req.body.batch + '-' + req.body.jobId + '-' + i + '.pdf')
        } catch(err) {
            response.message = err;
            response.status = 'error';
        }
    }
    let update = 'UPDATE `jobs` SET error = 0 Where jobId = '+req.body.jobId;
    await new Promise(function(resolve, reject) {
        con.query(update, (err,rows) => {
            if( err ) {
                return reject(err);
            }else {
                resolve(rows);
            }
        });
    }).then( ( rows ) => {
        response.message = 'File has been deteted successfully';
        response.status = 'success';
    }).catch( ( error ) => {
        console.log(error);
    });
    
    return res.json(response);
});

app.get('/api/admin/statistics/recalculate',async(req,res) => {
    console.log( new Date().toLocaleString(), 'Starting re-calculation...' );
    let response = { status: 'error', message : '', data: [] };
    await new Promise(function(resolve, reject) {
        con.query('SELECT `jobId` FROM `jobs`;', (err, rows) => {
            if( err ) {
                return reject(err);
            }else {
                resolve(rows);
            }
        });
    }).then( ( rows ) => {
        response.status = 'success';
        response.data = rows;
    }).catch( ( error ) => {
        response.error = error;
    });

    console.log( new Date().toLocaleString(), 'Got', response.data.length, 'jobs...' );
    if( response.data && response.data.length ) {
        for( job of response.data ) {
            let jobId = job.jobId,
            query = 'SELECT `jobId`, `status`, count(*) as `count` from `codes` WHERE `jobId` = "' + jobId + '" AND `status` != 0 GROUP BY `status`;';
            con.query( query, (err, rows) => {
                console.log( new Date().toLocaleString(), 'Select job #', jobId );
                if( ! err && rows && rows.length ) {
                    let errors = 0,
                    scanned = 0;
                    for( row of rows ) {
                        if( row.status === 1 ) {
                            scanned = row.count;
                        }else if( row.status === 2 ) {
                            errors = row.count;
                        }
                    }
                    // console.log( new Date().toLocaleString(), 'Job ID', jobId, rows );
                    let query_update = 'UPDATE `jobs` SET `scanned` = "' + scanned + '", `error` = "' + errors + '" WHERE `jobId` = "' + jobId + '";';
                    console.log( new Date().toLocaleString(), query_update );
                    con.query( query_update, (err, rows) => {
                        if( err ) {
                            console.error(err);
                        }

                        if( job.jobId === response.data[ response.data.length -1 ].jobId ) {
                            console.log( new Date().toLocaleString(), 'Ending re-calculation...' );
                        }
                    });
                }
            });        
        }
    }
    return res.json(response);
});

const PORT = (process.env.PORT || 3000);
app.listen( PORT, () => console.log( `Server is up and running on port ${PORT}...` ) );