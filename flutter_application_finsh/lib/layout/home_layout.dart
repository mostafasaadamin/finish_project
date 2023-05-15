import 'package:flutter/material.dart';
import 'package:flutter_application_finsh/layout/cubit/cubit.dart';
import 'package:flutter_application_finsh/layout/cubit/states.dart';
import 'package:flutter_bloc/flutter_bloc.dart';


class HomeLayout extends StatefulWidget {



  @override
  State<HomeLayout> createState() => _HomeLayoutState();
}

class _HomeLayoutState extends State<HomeLayout> 
{

  int currentIndex=0;

 
  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (BuildContext context)=>NewsCubit(),
      child: BlocConsumer <NewsCubit,NewsStates>(
       listener: (context,state){},
       builder: (context,state)
       {
        var cubit = NewsCubit.get(context);
        return Scaffold(
          body: cubit.screens[cubit.currentIndex],
          bottomNavigationBar: BottomNavigationBar(
            currentIndex: cubit.currentIndex,
            onTap: (index)
            {
              cubit.changeBottomNavBar(index);
            },
            items: cubit.bottomItems,
          ),

          // floatingActionButton: FloatingActionButton(
          //   onPressed: () 
          //   {
          //     showModalBottomSheet(
          //       context:context,
          //        builder: (context)=>LearningHome(),
          //     );
          //   },
          //   child: Icon(
          //     Icons.monitor_heart_sharp, 
          //   ),
          //   ),

        );
       },
      ),
    );
  }

 


}