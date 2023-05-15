
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_application_finsh/components/components.dart';

class login_screen extends StatefulWidget {
  
  @override
  _login_screenState  createState() => _login_screenState();
}

  var emailController =TextEditingController();
  var PasswordController=TextEditingController();
  var formKey = GlobalKey<FormState>();
  bool isPasswordShow=true;
  late String email;
  late String Password;



class _login_screenState extends State<login_screen> {

  @override


  Widget build(BuildContext context) {
   return Scaffold(
      appBar: AppBar(),
      body: Padding(
        padding: const EdgeInsets.all(22.0),
        child: Center(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Form(
              key: formKey,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  Text(
                    'Heart Rate',
                    style: TextStyle(
                      fontSize: 30.0,
                      fontWeight: FontWeight.bold,
                    ),
                    ),
                  SizedBox(
                    height: 15.0,
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children:[
                      Text(
                        'Don\'t have an account',
                        ),
                    //  defultTextButton(
                    // //   function: ()
                    // //  {
                    // //     navigateTo(
                    // //       context,
                    // //       registerScreen(),
                    // //     );
                    // //  },
                    //   text:'Register now'
                    //   ),
                    ],
                  ),
                  SizedBox(
                    height: 50.0,
                  ),
                    Text(
                    'Sign in to Heart Rate App',
                      style: TextStyle(
                        fontSize: 20.0,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  TextFormField(),
                  SizedBox(
                    height: 15,
                  ),
         defultFormFiled(
            controller: emailController,
            label: 'Email Address',
            prefix: Icons.email,
            type: TextInputType.emailAddress,
            validate: (value)
            {
              if(value.isEmpty)
              {
                return 'email must not be empty';
              }
              return null;
            },
         ),
                    SizedBox(
                    height: 15,
                  ),
                     defultFormFiled(
            controller: emailController,
            label: 'Password',
            prefix: Icons.lock,
            suffix: isPasswordShow ? Icons.visibility : Icons.visibility_off,
            isPassword: isPasswordShow,
            suffixPressed: ()
            {
              setState(() {
                isPasswordShow=!isPasswordShow;
              });
            },
            type: TextInputType.visiblePassword,
            validate: (value)
            {
              if(value.isEmpty)
              {
                return 'password must not be empty';
              }
              return null;
            },
         ),
                     SizedBox(
                    height: 20,
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        'Scan to login',
                        ),
                        TextButton(onPressed: (){},
                        child: Text(
                          'Forgot password?'
                        ),
                        ),
                    ],
                  ),
                  SizedBox(
                    height: 15.0,
                  ),
                   defultButton(
                    text:'login',
                    
                    function: (){
                      if(formKey.currentState!.validate())
                      {
                        print(emailController.text);
                        print(PasswordController.text);
                      }

                    },
                  
                   ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
