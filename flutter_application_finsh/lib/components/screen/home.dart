import 'package:flutter/material.dart';

class hello extends StatelessWidget {


  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(),
      body:  Padding(
        padding: const EdgeInsets.all(20.0),
        child: Center(
          child: SingleChildScrollView(
            child: Container(
              child: Text(
                'Welcome to App HR '
              ),
            ),
          ),
        ),
      ),
    );
  }
}