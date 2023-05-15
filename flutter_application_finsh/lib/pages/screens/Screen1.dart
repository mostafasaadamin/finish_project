
import 'package:flutter/material.dart';

class Screen1 extends StatelessWidget {
  const Screen1({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'What is the Heart Rate ?',
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          children: [
            Text(
              'Your heart rate,or pluse,is the number of times your heart beates per unit of time, usually a minute',
              style: TextStyle(
                fontSize: 22,
                color: Colors.white,
              ),
            ),
            SizedBox(
              height: 15,
            ),
            Text(
              'Each time the heart beats,blood is pumped out of the heart and into the body to supply oxygen to body funvtioning.',
               style: TextStyle(
                fontSize: 22,
                color: Colors.white,
              ),
            ),
            Text(
              'Since the need for oxygen changes when people are under different states, such as resting,exercising,etc,the workload of the heart to circulate blood changes.',
              style: TextStyle(
                fontSize: 22,
                color: Colors.white,
              ),
              ),
              SizedBox(
                height: 15,
              ),
              Text(
                'There are two different heart rate indexes,resting heart rate and target heart rate.',
                 style: TextStyle(
                fontSize: 22,
                color: Colors.white,
              ),
                ),
                Text(
                  'One is for measuring how your heart beats when you are at rest. The other one is used to know what your ideal target heart rate is during exercise.',
                  style: TextStyle(
                fontSize: 22,
                color: Colors.white,
              ),
                  ),
                                    
          ],
        ),
      ),
      backgroundColor: Color.fromARGB(255, 59, 62, 63),
    );
  }
}