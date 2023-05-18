
import 'package:flutter/material.dart';
import 'package:flutter_application_finsh/pages/screen_info/page_screen/viewhr.dart';
import 'package:page_transition/page_transition.dart';

class pageScreen1 extends StatelessWidget {
  const pageScreen1({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SingleChildScrollView(
        child: Column(
          children: [
            Container(
              height: 300,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Color.fromRGBO(255,250 ,182, 1),
                    Color.fromRGBO(255,239, 78, 1),
                  ]
                  ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children:<Widget> 
                [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children:<Widget>
                       [
                        Expanded(
                          flex: 4,
                          child: Padding(
                            padding: const EdgeInsets.all(16.0),
                            child: Text(
                              'Information and Knowledge',style: TextStyle(
                                fontSize: 25,
                                fontWeight: FontWeight.bold,
                                color: Colors.black,
                              ),
                            ),
                          ),
                        ),
                        SizedBox(
                          height: 15,
                        ),
                        Expanded(
                          flex: 3,
                          child: Image.asset('assets/images/hr.png'),
                        ),
                       ],
                    )
                ],
              ),
            ),
            SizedBox(
              height: 30,
            ),
            
            Container(
              height: 200,
              width: double.infinity,
              child: ListView(
                padding: EdgeInsets.only(bottom: 20,left: 20),
                scrollDirection: Axis.horizontal,

                children: <Widget>
                [
                  makeCard(
                    context: context,
                    startColor: Color.fromRGBO(252, 212, 155, 1),
                    endColor: Color.fromRGBO(251, 53, 105, 1),
                    image: 'assets/images/heart-rate.png',
                  ),
                  SizedBox(
                    height: 10,
                  ),
                   makeCard(
                    context: context,
                    startColor: Color.fromRGBO(203, 251, 255, 1),
                    endColor: Color.fromRGBO(81, 233, 234, 1),
                    image: 'assets/images/heart-attack.png',
                  ),
                  
                ],  
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget makeCard({context,startColor,endColor,image}){

    return GestureDetector(
      onTap: (){
            Navigator.push(
              context,
               PageTransition(type: PageTransitionType.fade,
                  child: ViewHR()
                )
            );
        },
      child: AspectRatio(
        aspectRatio: 4/5,
        child: Container(
          margin: EdgeInsets.only(right: 20),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(13.0),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              colors: [
                startColor,
                endColor,
              ],
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.grey,
                blurRadius: 10,
                offset: Offset(5, 10),
              )
            ]
          ),
          child: Padding(
            padding:EdgeInsets.all(50),
            child: Center(
              child: Image.asset(image),
            ),
            ),
        ),
      ),
    );

  }

}