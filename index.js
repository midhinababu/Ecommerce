require('dotenv').config();
const express = require("express");
const app = express();
app.set('view engine', 'ejs');
var path = require('path');
var session = require('express-session');
const { stringify } = require('querystring');
var bodyParser = require('body-parser');
const multer = require('multer');
const bcrypt = require("bcrypt");
const { pipeline } = require('stream/promises');
const ObjectID = require('mongodb').ObjectId;
const $ = require('jquery');
const axios = require('axios');


//const uploads = multer({ dest: 'uploads/' });



const PORT = process.env.PORT || 4000;
app.set('view engine', 'ejs');
let db;
//midddlewares
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static('uploads'));

app.use(session({
    secret: 'secretkey',
    resave: false,
    saveUninitialized: true, 
    cookie: { maxAge: 600000 }
}))

const MongoClient = require('mongodb').MongoClient;


//DB Connection
const uri = 'mongodb://localhost:27017/';
const client = new MongoClient(uri);


async function run() {
    try {
        await client.connect();
        db = client.db('ecommerce');
        console.log("Database Connected");

    } catch (error) {
        console.log(error);
    }
}
run().catch(console.dir);

////////////user validation 

const verifyuserlogin = (req, res, next) => {

    if (req.session.user_id) {
        next()
    } else {
        res.redirect('/home');
    }
}


app.get("/register", (req, res) => {
    res.render("register")
});

app.post("/register", (req, res) => {
    let uname = req.body.uname;
    let email = req.body.email;
    let password = req.body.password;
    const saltRounds = 10;
    bcrypt.hash(password, saltRounds, (err, hash) => {
        let bcrypt_password = hash;
        register();
        async function register() {
            let result = await db.collection('regUser').insertOne({ uname: uname, email: email, password: bcrypt_password });
            if (result) {
                console.log("regUser Added");
                res.redirect("/home#login");
            } else {
                res.redirect('/register')
            }
        }
    });
});

app.get("/home", (req, res) => {
    if (req.session.loggedIn) {

        res.redirect("/")
    } else {

        res.render("home", { loginERR: req.session.loginErr });
    }
});


app.post("/home", function (req, res) {
    let uname = req.body.uname;
    let upassword = req.body.password;
    const saltRounds = 10;
    let bcrypt_password;
    bcrypt.hash(upassword, saltRounds, (err, hash) => {
        bcrypt_password = hash;


        loginuser();
    });

    async function loginuser() {
        let result = await db.collection('regUser').findOne({ uname: uname });
        // console.log("password=" + upassword);
        // console.log("password="+result.password);
        // console.log(result);
        if (result) {
            let value = await bcrypt.compare(upassword, result.password);
            if (value) {
                req.session.loggedIn = true;
                req.session.user = result.uname;
                req.session.user_id = result._id;

                res.redirect("/");
            }
            else {

                res.redirect('/home');
            }
        }
        else {
            req.session.loginErr = true;
            console.log(req.session.loginErr);
            res.redirect('/home#login');
        }
    }
});


app.get("/", (req, res) => {
    user = req.session.user;
    let cartid = new ObjectID(req.session.user_id);
    var cartitemcount;
    console.log(user);

    let products = [];
    viewPrdt();
    async function viewPrdt() {
        ////  finding cart item count
        db.collection('cart').findOne({ user_cart_id: cartid }, { products: 1, _id: 0 })
            .then(doc => {
                cartitemcount = doc.products.length;
                req.session.cartitemcount = cartitemcount;
            })
            .catch(err => console.log(err));

        ////  products
        const cursor = db.collection('product').find();
        // console.log(await db.collection('product').countDocuments());
        let pr_length = await db.collection('product').countDocuments()
        if ((pr_length) === 0) {
            console.log("No documents found!");
        }
        await cursor.forEach((data) => {
            products.push(data)
        });
        res.render("index", { products: products, user, cartitemcount });
    }
});


app.get("/user/singleprdt/:_id", function (req, res) {
    var prdtid = new ObjectID(req.params._id);
    // prdt has string type value like--> new ObjectId("641853f65640f7e51af47d55")
    cartitemcount = req.session.cartitemcount;

    product();
    async function product() {
        let result = await db.collection('product').findOne({ _id: prdtid });
        if (result) {
            res.render("user/singleprdt", ({ result }));
        }
    }
});


app.get("/user/add_to_cart/:_id", function (req, res) {
    console.log("useraddtocart");
    let user_cart_id = new ObjectID(req.session.user_id);
    let user_name = req.session.user;
    let Prdct_id = new ObjectID(req.params._id);
    let status;
    let product_object = {
        item: Prdct_id,
        quantity: 1
    }
    add_to_cart();

    async function add_to_cart() {
        let findcartuser = await db.collection('cart').findOne({ user_cart_id: user_cart_id });
        if (findcartuser) {
            console.log("user already have a cart");
            let arrayupdate = await db.collection('cart').updateOne({ 'user_cart_id': user_cart_id },

                { $addToSet: { products: product_object } })

            if (arrayupdate.modifiedCount > 0) {
                console.log("Product Updated");
                status = "Added To Cart";
            } else {
                status = "Failed ! Can't Add Item To Cart";
                console.log("Product Can't add to cart");
            }

        } else {
            let cartobj = {
                user_cart_id: user_cart_id,
                products: [product_object]
            }
            let result = await db.collection('cart').insertOne(cartobj);
            status = "Added TO Cart";
            // console.log("cart");    
            // console.log(result);
        }
        console.log(status);
        res.send(status);
        // res.redirect('/user/singleprdt/:Prdct_id');
        //res.render("user/add_to_cart");
    }
});


app.get("/user/cart", verifyuserlogin, function (req, res) {
    let user_cart_id = new ObjectID(req.session.user_id);
    cartitemcount = req.session.cartitemcount;
    console.log(user_cart_id);
    findcart();
    async function findcart() {
        console.log('///');
        const value = [
            {
                $match: { user_cart_id: user_cart_id }
            },
            {
                $unwind: '$products'
            },
            {
                $project: { item: '$products.item', quantity: '$products.quantity' }
            },
            {
                $lookup: {
                    from: 'product',
                    localField: 'item',
                    foreignField: '_id',
                    as: 'cartitems'
                }
            }
        ]
        let cartitem = [];
        const aggCursor = db.collection('cart').aggregate(value);
        for await (const doc of aggCursor) {
            cartitem.push(doc);
        }
        // console.log(cartitem);
        // console.log(cartitem[0].cartitems);
        res.render("user/cart", { cartitem });
    }
});


app.post("/user/cartcount", (req, res) => {
    let user_cart_id = new ObjectID(req.session.user_id);
    let cartid = new ObjectID(req.body.cartid);
    //console.log(req.body);
    let prdtid = new ObjectID(req.body.prdtid);
    let count = parseInt(req.body.count);
    let quantity = parseInt(req.body.quantity);

    cartcount();
    async function cartcount() {
        let cart_update_quantity = await db.collection('cart').updateOne({ _id: cartid, 'products.item': prdtid },
            {
                $inc: { 'products.$.quantity': count }
            });
        //console.log(cart_update_quantity);
        if (cart_update_quantity.modifiedCount > 0) {

            cart_total(user_cart_id)
                .then(cartamount => {

                    //console.log(cartamount);
                    //console.log(cartamount[0].total);
                    let totalamount = cartamount[0].total;
                    // console.log(status);
                    //let status = 'success';
                    console.log("count Updated");
                    res.send(JSON.stringify(totalamount));
                    // res.render("user/placeorder", { cartamount });
                })
                .catch(error => {
                    console.error(error);
                });
            // let status = 'success';
            // console.log("count Updated");
            //res.send(status);
        }
    }
});


app.get("/user/cartitem_remove/:_id", (req, res) => {
    let user_cart_id = new ObjectID(req.session.user_id);
    let cart_prdt_id = new ObjectID(req.params._id);
    console.log(user_cart_id);
    console.log(cart_prdt_id);
    delete_cart_item();
    async function delete_cart_item() {
        let result = await db.collection('cart').updateOne(
            { user_cart_id: user_cart_id },
            { $pull: { products: cart_prdt_id } }
        );
        if (result) {
            res.redirect('/user/cart');
        }
    }
});


app.get("/user/orders", (req, res) => {
   let user_id = new ObjectID(req.session.user_id);
   order();
   async function order(){
   let order_detail=await db.collection('order').findOne({user_id:user_id})
  if(order_detail)
  // console.log(order_detail);
  res.render('user/orders',{order_detail});
}
});





async function cart_total(user_cart_id) {
    // let user_cart_id = new ObjectID(req.session.user_id);
    let cartamount = [];
    const total = [
        {
            $match: { user_cart_id: user_cart_id }
        },
        {
            $unwind: '$products'
        },
        {
            $project: {
                item: '$products.item',
                quantity: '$products.quantity'
            }
        },
        {
            $lookup: {
                from: 'product',
                localField: 'item',
                foreignField: '_id',
                as: 'cartitems'
            }
        },
        {
            $project: {
                item: 1,
                quantity: 1,
                products: {
                    $arrayElemAt: ['$cartitems', 0]
                }
            }
        },
        {
            $group: {
                _id: null,
                total: { $sum: { $multiply: ['$quantity', '$products.price'] } }
            }
        }
    ]
    const aggCursor = db.collection('cart').aggregate(total);
    for await (const doc of aggCursor) {
        // console.log(doc);
        cartamount.push(doc);

    }
   // console.log(cartamount);
    return (cartamount)
}





app.get("/user/placeorder", (req, res) => {
    let user_cart_id = new ObjectID(req.session.user_id);
    cart_total(user_cart_id)
        .then(cartamount => {
           // console.log("function call//////////////")
           // console.log(cartamount);
            res.render("user/placeorder", { cartamount });
        })
        .catch(error => {
            console.error(error);
        });
    // async function cart_total() {
    // let user_cart_id = new ObjectID(req.session.user_id);
    // let cartamount = [];
    //     const total = [
    //         {
    //             $match: { user_cart_id: user_cart_id }
    //         },
    //         {
    //             $unwind: '$products'
    //         },
    //         {
    //             $project: {
    //                 item: '$products.item',
    //                 quantity: '$products.quantity'
    //             }
    //         },
    //         {
    //             $lookup: {
    //                 from: 'product',
    //                 localField: 'item',
    //                 foreignField: '_id',
    //                 as: 'cartitems'
    //             }
    //         },
    //         {
    //             $project: {
    //                 item: 1,
    //                 quantity: 1,
    //                 products: {
    //                     $arrayElemAt: ['$cartitems',0]
    //                 }
    //             }
    //         },
    //         {
    //             $group: {
    //                 _id: null,
    //                 total: { $sum: { $multiply: ['$quantity', '$products.price'] } }
    //             }
    //         }
    //     ]
    //         let cartamount = [];
    //     const aggCursor = db.collection('cart').aggregate(total);
    //     for await (const doc of aggCursor) {
    //        // console.log(doc);
    //        cartamount.push(doc);

    //     }

    //         console.log(cartamount[0].total);
    //         res.render("user/placeorder", { cartamount });
    // }
});


app.post("/user/placeorder", (req, res) => {
   // console.log(req.body);
    let name = req.body.name;
    let address = req.body.address;
    let email = req.body.email;
    let mobno = req.body.mobno;
    let payment_type = req.body.payment_type;
    let cardnumber = req.body.cardnumber;
    let cardexpiry = req.body.cardexpiry;
    let cardcvv = req.body.cardccv;
    let cardholdername = req.body.cardholdername;
    let user_cart_id = new ObjectID(req.session.user_id);

    let date=new Date().toLocaleDateString("en-GB");
 
          //cart collection venam evide 

    cart_total(user_cart_id)
        .then(cartamount => {
            let totalamount = cartamount[0].total;

            order_prdt_list();
            async function order_prdt_list() {
                let prdt_list = await db.collection("order").insertOne({user_id:user_cart_id, name: name, address: address,date:date, email: email, mobno: mobno, totalamount: totalamount, payment_type: payment_type, cardnumber: cardnumber, cardexpiry: cardexpiry, cardcvv: cardcvv, cardholdername: cardholdername });
                if (prdt_list) {
                   // console.log(prdt_list);
                  //  console.log(cartamount);
                    res.send(JSON.stringify("Order Placed Successfully"));
                  }
            }
        })
        .catch(error => {
            console.error(error);
        });
});


//////admin///////

app.get("/admin", (req, res) => {
    res.render("admin/adminhome");
});

app.get("/admin/viewprdt", (req, res) => {
    let products = [];
    viewPrdt();

    async function viewPrdt() {
        const cursor = db.collection('product').find();
        // console.log(await db.collection('product').countDocuments());
        let pr_length = await db.collection('product').countDocuments()
        if ((pr_length) === 0) {
            console.log("No documents found!");
        }
        await cursor.forEach((data) => {
            products.push(data)
        });
        // console.log(products);
        res.render("admin/viewprdt", ({ products: products }));
    }
});


app.get("/admin/addprdt", (req, res) => {
    res.render("admin/addprdt");
});

app.get("/admin/product_delete", (req, res) => {
    var prdtid = new ObjectID(req.query.id);
    // prdtid is a string value
    // query has no parameters and returns a string
    deleteproduct();
    async function deleteproduct() {
        let result = await db.collection('product').deleteOne({ _id: prdtid });
        console.log(result)
        if (result) {
            res.redirect('/admin/viewprdt');
        }
    }
});

app.get("/admin/product_update/:_id", (req, res) => {
    var prdtid = new ObjectID(req.params._id);
    console.log(prdtid);
    // prdt has string type value 

    findproduct();
    async function findproduct() {
        let result = await db.collection('product').findOne({ _id: prdtid });
        if (result) {

            res.render("admin/product_update", { result });
        }
    }
});

app.post("/admin/updateprdt/:_id", (req, res) => {
    var prdtid = new ObjectID(req.params._id);
    let pname = req.body.pname;
    let pcategory = req.body.pcategory;
    let pdescription = req.body.pdescription;
    let price = parseInt(req.body.price);
    Updatedata();
    async function Updatedata() {
        // let result = await db.collection('product').findOne({ _id: prdtid });
        let result = await db.collection('product').updateOne({ '_id': prdtid },
            { $set: { pname: pname, pcategory: pcategory, pdescription: pdescription, price: price } })
        if (result.modifiedCount > 0) {
            console.log("Product Updated");
            res.redirect("/admin/viewprdt");
        }
        else {
            console.log("No Data Updated");
            res.redirect("/admin/viewprdt");
        }
    }
});



//image upload

var product_file = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/product_file')
    },
    filename: function (req, file, cb) {
        var filename = file.originalname;
        cb(null, filename);
    }
});
var p_file = multer({ storage: product_file });

app.post("/admin/addprdt", p_file.any(), function (req, res) {
    let pname = req.body.pname;
    // console.log(req.body);
    // console.log(req.files);
    let pcategory = req.body.pcategory;
    let pdescription = req.body.pdescription;
    let price = parseInt(req.body.price);
    let prdtphoto = `/product_file/${req.files[0].originalname}`;
    addPrdt();
    async function addPrdt() {
        let result = await db.collection('product').insertOne({ pname: pname, pcategory: pcategory, pdescription: pdescription, price: price, prdtphoto: prdtphoto });
        if (result) {
            console.log("product Added");
            res.redirect('/admin/viewprdt');
        }
    }
});



app.get("/logout", function (req, res) {
    req.session.destroy();
    res.redirect("/home#login");
});

app.listen(PORT, () => {
    console.log(`server started at ${PORT}`);
})