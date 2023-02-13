"use strict";
const { alkosto, aki, alcance, falabella, ktronix, liverpool } =
  require("../utils/properties").stores;

const chromium = require("chrome-aws-lambda");
const AWS      = require("aws-sdk");
const sqs      = new AWS.SQS();
const sqsuri   = `https://sqs.us-east-2.amazonaws.com/${process.env.ACCOUNT_ID}/${process.env.NAME_QUEUE}`;

const sendData = (paramsSQS) => {
  return new Promise((resolve, reject) => {
    sqs.sendMessage(paramsSQS, function (err, content) {
      if (err) {
        console.log(err);
        return reject(err);
      }
      resolve(content);
    });
  });
};

module.exports.scraper = async (store,product) => {
  let use;

  switch (store) {
    case "alkosto":
      use = alkosto;
      break;
    case "ktronix":
      use = ktronix;
      break;
    case "falabella":
      use = falabella;
      break;
    default:
      break;
  }

  const browser = await chromium.puppeteer.launch({
    args: chromium.args,
    defaultViewport: null,
    executablePath: await chromium.executablePath,
    headless: chromium.headless,
    ignoreHTTPSErrors: true,
    userDataDir: "dev/null",
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0 Win64 x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.181 Safari/537.36"
  );

  const navigationPromise = page.waitForNavigation({
    waitUntil: "load",
  });

  if (store == "ktronix" || store == "alkosto") {
    await page.goto(`${use.uri}/search/?text=${product}`);
  } else {
    await page.goto(`${use.uri}`);
    await page.waitForSelector(use?.input, { timeout: 3000 });
    await page.type(use?.input, product);
    await page.keyboard.press("Enter");
  }

  await navigationPromise;

  await page.waitForTimeout(3000);

  let dataResponse;

  dataResponse = await page.evaluate(
    (description, price, name, image) => {
      let products = [];
      let description_list = [];
      let array_description = document.querySelectorAll(description);
      let array_price = document.querySelectorAll(price);
      let name_price = document.querySelectorAll(name);
      let image_array = document.querySelectorAll(image);

      for (let i = 0; i < array_description.length; i++) {
        for (let f = 0; f < array_description[i]?.children.length; f++) {
          description_list.push(array_description[i].children[f]?.innerText);
        }

        products.push({
          name: name_price[i]?.innerText,
          image: image_array[i]?.src,
          price: array_price[i]?.innerText,
          description: description_list,
        });

        description_list = [];
      }

      dataResponse = {
        found: products.length > 0 ? true : false,
        products,
      };

      return dataResponse;
    },
    use.description,
    use.price,
    use.name,
    use.image
  );

  await browser.close();

  return {
    statusCode: 200,
    body: JSON.stringify({ data: dataResponse }, null, 2),
  };
};

module.exports.sendSearch = async (event) => {
    try {
  
      const data = JSON.parse(event.body).products
      for (let i = 0; i < data.length; i++) {
        let paramsSQS = {
          MessageBody: JSON.stringify(data[i]),
          QueueUrl: sqsuri,
          DelaySeconds: 5,
          MessageAttributes: {
            Method: {
              DataType: "String",
              StringValue: "POST",
            },
          },
        };
        let sendSqsMessage = await sendData(paramsSQS);
      }
      return {
        statusCode: 200,
        body: JSON.stringify({ message: '🚀 -> 🌙' }, null, 2),
      };
    } catch (err) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: err }, null, 2),
      };
    }
};

module.exports.find = async (event) => {
  try {
    
    let message = "";
    event.Records.map((record) => {
      message = JSON.parse(record.body);
    });

    console.log("sqsMessage", message);
    
    let stores = ['alkosto','ktronix','falabella']

    let result

    for (let i = 0; i < stores.length; i++) {
        result = await this.scraper(
            stores[i],
            message.name
        );
    }
   
    return {
      statusCode: 200,
      body: JSON.stringify(result, null, 2),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify(err, null, 2),
    };
  }
};
