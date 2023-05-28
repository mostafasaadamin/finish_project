import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_application_finsh/layout/home_layout.dart';
import 'package:flutter_application_finsh/models/face_detection.dart';
import 'package:provider/provider.dart';
void main() async {
  runApp(MyApp());
}

class MyApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return  MultiProvider(
        providers: [
       ChangeNotifierProvider<LearningFaceDetectionState>(create: (_) =>
       LearningFaceDetectionState())],
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          scaffoldBackgroundColor: Colors.white,
          appBarTheme: AppBarTheme(
            backwardsCompatibility: false,
            systemOverlayStyle: SystemUiOverlayStyle(
              statusBarColor: Colors.black,
            ),
            backgroundColor: Colors.grey,
            elevation: 0.0,
            titleTextStyle: TextStyle(
              color: Colors.white,
              fontSize: 22.0,
              fontWeight: FontWeight.bold,
            ),
          ),
          bottomNavigationBarTheme: BottomNavigationBarThemeData(
            type: BottomNavigationBarType.fixed,
            selectedItemColor: Colors.deepOrange,
            elevation: 20.0,

          ),
        ),
       home:HomeLayout(),

      ),
    );
  }
}

