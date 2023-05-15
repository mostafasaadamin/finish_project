
import 'package:flutter/material.dart';

class Screen2 extends StatelessWidget {
  const Screen2({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Factors affecting HR ?'
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20.0),
        child: SingleChildScrollView(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.start,

            children: [
              Text(
                'Temperature:',
              style: TextStyle(
                 fontSize: 25,
                  color: Colors.red,
                  fontWeight: FontWeight.bold,
              ),
              ),
              SizedBox(
                height: 10,
              ),
              Text(
                'The change in air temperature or your body temperature will affect your heart rate, if you feel too cold or too hot, the heart will boost the pumping of blood to your skin to warm you up or cool you down, therefore, your heart rate should not exceed 5 to 10 beats per minute. Moreover, high humidity can also lead to an increased heart rate',
                style: TextStyle(
                  fontSize: 22,
                  color: Colors.white,
                ),
              ),
              SizedBox(
                height: 15,
              ),
              Text(
                'Body position:',
                 style: TextStyle(
                  fontSize: 25,
                   color: Colors.red,
                  fontWeight: FontWeight.bold,
                ),
              ),
              SizedBox(
                height: 10,
              ),
              Text(
                'Your heart rate usually does not change in different body positions. However, if you suddenly change your body position to a standing position, your heart rate will increase in the first 15 to 20 seconds. After that, the number will return to the original',
                style: TextStyle(
                  fontSize: 22,
                  color: Colors.white,
                ),
                ),
                SizedBox(
                  height: 15,
                ),
                Text(
                  'Age:',
                   style: TextStyle(
                  fontSize: 25,
                  color: Colors.red,
                  fontWeight: FontWeight.bold,
                ),
                  ),
                  Text(
                    'When you get older, your heart rate RHR(resting heart rate) will not change significantly while your training heart rate (THR) will also become',
                    style: TextStyle(
                  fontSize: 22,
                  color: Colors.white,
                ),
                    ),
                                      
            ],
          ),
        ),
      ),
      backgroundColor: Color.fromARGB(255, 59, 62, 63),
    );
  }
}