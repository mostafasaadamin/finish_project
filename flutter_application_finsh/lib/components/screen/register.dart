
import 'package:flutter/material.dart';


class registerScreen extends StatelessWidget {


  var nameController =TextEditingController();
  var emailController =TextEditingController();
  var PasswordController =TextEditingController();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(),
      body: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Center(
          child: SingleChildScrollView(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(
                   height: 50.0,
                ),
                Text(
                  'Heart Rate',
                  style: TextStyle(
                    color: Colors.black,
                    fontSize: 25.0,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                SizedBox(
                  height: 15.0,
                ),

                TextFormField(
                      controller: nameController,
                      keyboardType: TextInputType.name,
                      onFieldSubmitted: (value)
                      {
                        print(value);
                      },
                      onChanged: (value)
                      {
                        print(value);
                      },
                  decoration: InputDecoration(
                    labelText: 'First Name',
                    border: OutlineInputBorder(),
                  ),
              
                ),
                           SizedBox(
                   height: 15.0,
                ),
                TextFormField(
                      controller: nameController,
                      keyboardType: TextInputType.name,
                      onFieldSubmitted: (value)
                      {
                        print(value);
                      },
                      onChanged: (value)
                      {
                        print(value);
                      },
                  decoration: InputDecoration(
                    labelText: 'Last Name',
                    border: OutlineInputBorder(),
                  ),
                ),
                           SizedBox(
                   height: 15.0,
                ),
                TextFormField(
                      controller: emailController,
                      keyboardType: TextInputType.emailAddress,
                      onFieldSubmitted: (value)
                      {
                        print(value);
                      },
                      onChanged: (value)
                      {
                        print(value);
                      },
                  decoration: InputDecoration(
                    prefixIcon: Icon(
                      Icons.email,
                    ),
                    labelText: 'Email Address',
                    border: OutlineInputBorder(),
                  ),
              
                ),
                           SizedBox(
                   height: 15.0,
                ),
                TextFormField(
                      controller: PasswordController,
                        obscureText: true,
                      keyboardType: TextInputType.visiblePassword,
                      onFieldSubmitted: (value)
                      {
                        print(value);
                      },
                      onChanged: (value)
                      {
                        print(value);
                      },
                  decoration: InputDecoration(
                    prefixIcon: Icon(
                      Icons.lock,
                    ),
                    suffixIcon: Icon(
                      Icons.remove_red_eye,
                    ),
                    labelText: 'password',
                    border: OutlineInputBorder(),
                  ),
              
                ),
                           SizedBox(
                   height: 15.0,
                ),
                TextFormField(
                      controller: PasswordController,
                        obscureText: true,
                      keyboardType: TextInputType.visiblePassword,
                      onFieldSubmitted: (value)
                      {
                        print(value);
                      },
                      onChanged: (value)
                      {
                        print(value);
                      },
                  decoration: InputDecoration(
                    prefixIcon: Icon(
                      Icons.lock,
                    ),
                    suffixIcon: Icon(
                      Icons.remove_red_eye,
                    ),
                    labelText: 'Conform password',
                    border: OutlineInputBorder(),
                  ),
              
                ),
                SizedBox(
                  height: 40.0,
                ),

                  Container(
                  width: double.infinity,
                  color: Colors.blue,
                  child: MaterialButton(
                    onPressed: ()
                    {
                      print(emailController.text);
                      print(PasswordController.text);
                     
                    },
                    child: Text(
                      'Register Now ',
                      style: TextStyle(
                        color: Colors.white,
                      ),
                    ),
                    ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}